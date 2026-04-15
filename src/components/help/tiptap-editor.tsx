'use client'

import { useEditor, EditorContent, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Youtube from '@tiptap/extension-youtube'
import CodeBlock from '@tiptap/extension-code-block'
import {
  Bold,
  Italic,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Link as LinkIcon,
  Code2,
  Youtube as YoutubeIcon,
  Undo2,
  Redo2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'

interface TiptapEditorProps {
  value: string
  onChange: (html: string) => void
  placeholder?: string
}

function Toolbar({ editor }: { editor: Editor }) {
  if (!editor) return null

  const buttonBase =
    'h-8 w-8 p-0 border-teal-200 text-[#08525E] hover:bg-teal-50 hover:text-teal-800'

  const isActive = (name: string, attrs?: Record<string, unknown>) =>
    editor.isActive(name, attrs)
      ? 'bg-teal-100 border-teal-400 text-teal-800'
      : ''

  function addLink() {
    const prev = editor.getAttributes('link').href as string | undefined
    const url = window.prompt('URL eingeben', prev ?? 'https://')
    if (url === null) return
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
      return
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
  }

  function addYoutube() {
    const url = window.prompt('YouTube-URL', 'https://www.youtube.com/watch?v=')
    if (!url) return
    editor.commands.setYoutubeVideo({ src: url })
  }

  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-teal-100 bg-teal-50/30 p-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={`${buttonBase} ${isActive('bold')}`}
        onClick={() => editor.chain().focus().toggleBold().run()}
        aria-label="Fett"
      >
        <Bold className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={`${buttonBase} ${isActive('italic')}`}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        aria-label="Kursiv"
      >
        <Italic className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={`${buttonBase} ${isActive('heading', { level: 2 })}`}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        aria-label="Ueberschrift 2"
      >
        <Heading2 className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={`${buttonBase} ${isActive('heading', { level: 3 })}`}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        aria-label="Ueberschrift 3"
      >
        <Heading3 className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={`${buttonBase} ${isActive('bulletList')}`}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        aria-label="Aufzaehlung"
      >
        <List className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={`${buttonBase} ${isActive('orderedList')}`}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        aria-label="Nummerierte Liste"
      >
        <ListOrdered className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={`${buttonBase} ${isActive('link')}`}
        onClick={addLink}
        aria-label="Link"
      >
        <LinkIcon className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={`${buttonBase} ${isActive('codeBlock')}`}
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        aria-label="Code-Block"
      >
        <Code2 className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={buttonBase}
        onClick={addYoutube}
        aria-label="YouTube einbetten"
      >
        <YoutubeIcon className="h-4 w-4" />
      </Button>

      <div className="mx-1 h-6 w-px bg-teal-200" />

      <Button
        type="button"
        variant="outline"
        size="sm"
        className={buttonBase}
        onClick={() => editor.chain().focus().undo().run()}
        aria-label="Rueckgaengig"
      >
        <Undo2 className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={buttonBase}
        onClick={() => editor.chain().focus().redo().run()}
        aria-label="Wiederholen"
      >
        <Redo2 className="h-4 w-4" />
      </Button>
    </div>
  )
}

export function TiptapEditor({ value, onChange, placeholder }: TiptapEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: false,
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
      }),
      Youtube.configure({
        width: 640,
        height: 360,
        nocookie: true,
      }),
      CodeBlock,
    ],
    content: value,
    editorProps: {
      attributes: {
        class:
          'min-h-[360px] max-w-none p-4 focus:outline-none text-sm leading-relaxed [&_h2]:mt-6 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-[#08525E] [&_h3]:mt-4 [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:text-[#08525E] [&_p]:mt-3 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:mt-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_a]:text-teal-700 [&_a]:underline [&_code]:rounded [&_code]:bg-teal-50 [&_code]:px-1 [&_code]:text-teal-800 [&_pre]:mt-3 [&_pre]:rounded-lg [&_pre]:bg-slate-900 [&_pre]:p-3 [&_pre]:text-xs [&_pre]:text-slate-100',
        'aria-label': placeholder ?? 'Artikel-Inhalt',
      },
    },
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML())
    },
    immediatelyRender: false,
  })

  if (!editor) {
    return (
      <div className="rounded-lg border border-teal-100 bg-teal-50/40 p-4 text-sm text-muted-foreground">
        Editor wird geladen...
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-lg border border-teal-200 bg-white">
      <Toolbar editor={editor} />
      <EditorContent editor={editor} />
    </div>
  )
}
