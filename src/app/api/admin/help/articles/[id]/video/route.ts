import { NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/admin-context'
import { createAdminClient } from '@/lib/supabase/admin'

// POST /api/admin/help/articles/[id]/video – MP4 in Supabase Storage hochladen
// Erwartet multipart/form-data mit Feld "file"
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const adminUser = await verifyAdmin()
  if (!adminUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  if (!id) {
    return NextResponse.json({ error: 'Ungültige Artikel-ID.' }, { status: 400 })
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json(
      { error: 'Ungültiger Upload (multipart/form-data erwartet).' },
      { status: 400 },
    )
  }

  const file = formData.get('file')
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: 'Keine Datei übermittelt.' }, { status: 400 })
  }

  const MAX_SIZE = 500 * 1024 * 1024 // 500 MB
  if (file.size === 0) {
    return NextResponse.json({ error: 'Datei ist leer.' }, { status: 400 })
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json(
      { error: 'Datei zu groß (max. 500 MB).' },
      { status: 413 },
    )
  }

  if (file.type !== 'video/mp4') {
    return NextResponse.json(
      { error: 'Nur MP4-Videos sind erlaubt.' },
      { status: 400 },
    )
  }

  try {
    const admin = createAdminClient()

    // Artikel pruefen
    const { data: article } = await admin
      .from('help_articles')
      .select('id, video_storage_path, deleted_at')
      .eq('id', id)
      .maybeSingle()

    if (!article || article.deleted_at) {
      return NextResponse.json({ error: 'Artikel nicht gefunden.' }, { status: 404 })
    }

    // Pfad: {article_id}/{timestamp}.mp4
    const path = `${id}/${Date.now()}.mp4`
    const arrayBuffer = await file.arrayBuffer()

    const { error: uploadError } = await admin.storage
      .from('help-videos')
      .upload(path, arrayBuffer, {
        contentType: 'video/mp4',
        upsert: false,
      })

    if (uploadError) {
      console.error('[admin/help/video] upload error:', uploadError)
      return NextResponse.json(
        { error: uploadError.message },
        { status: 500 },
      )
    }

    // Alten Path loeschen (wenn vorhanden)
    if (article.video_storage_path) {
      await admin.storage.from('help-videos').remove([article.video_storage_path])
    }

    // Public URL holen (Bucket ist public)
    const { data: pub } = admin.storage.from('help-videos').getPublicUrl(path)

    // Artikel aktualisieren
    const { error: updateError } = await admin
      .from('help_articles')
      .update({
        video_storage_path: path,
        video_url: null, // Storage-Video hat Vorrang
      })
      .eq('id', id)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      storage_path: path,
      public_url: pub.publicUrl,
    })
  } catch (error) {
    console.error('[admin/help/video] POST error:', error)
    return NextResponse.json(
      { error: 'Video-Upload fehlgeschlagen.' },
      { status: 500 },
    )
  }
}

// DELETE /api/admin/help/articles/[id]/video – Video entfernen
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const adminUser = await verifyAdmin()
  if (!adminUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  try {
    const admin = createAdminClient()
    const { data: article } = await admin
      .from('help_articles')
      .select('video_storage_path')
      .eq('id', id)
      .maybeSingle()

    if (article?.video_storage_path) {
      await admin.storage.from('help-videos').remove([article.video_storage_path])
    }

    const { error } = await admin
      .from('help_articles')
      .update({ video_storage_path: null, video_url: null })
      .eq('id', id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[admin/help/video] DELETE error:', error)
    return NextResponse.json(
      { error: 'Video konnte nicht entfernt werden.' },
      { status: 500 },
    )
  }
}
