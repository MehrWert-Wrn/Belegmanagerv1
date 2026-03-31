'use client'

import { useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { Upload, FileSpreadsheet, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface DropZoneProps {
  onFileAccepted: (file: File) => void
  isLoading?: boolean
  error?: string | null
}

export function DropZone({ onFileAccepted, isLoading, error }: DropZoneProps) {
  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length > 0) {
        onFileAccepted(acceptedFiles[0])
      }
    },
    [onFileAccepted]
  )

  const { getRootProps, getInputProps, isDragActive, fileRejections } =
    useDropzone({
      onDrop,
      accept: {
        'text/csv': ['.csv'],
        'application/vnd.ms-excel': ['.csv'],
      },
      maxFiles: 1,
      maxSize: 5 * 1024 * 1024, // 5 MB
      disabled: isLoading,
    })

  const rejectionMessage =
    fileRejections.length > 0
      ? fileRejections[0].errors
          .map((e) => {
            if (e.code === 'file-too-large') return 'Datei ist zu gross (max. 5 MB).'
            if (e.code === 'file-invalid-type')
              return 'Nur CSV-Dateien werden akzeptiert.'
            return e.message
          })
          .join(' ')
      : null

  const displayError = error || rejectionMessage

  return (
    <div className="space-y-3">
      <div
        {...getRootProps()}
        className={cn(
          'flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-8 transition-colors cursor-pointer',
          isDragActive
            ? 'border-teal-500 bg-teal-50 dark:bg-teal-950/20'
            : 'border-muted-foreground/25 hover:border-muted-foreground/50',
          isLoading && 'opacity-50 cursor-not-allowed',
          displayError && 'border-destructive/50'
        )}
        role="button"
        aria-label="CSV-Datei zum Hochladen hierher ziehen oder klicken"
      >
        <input {...getInputProps()} />
        {isLoading ? (
          <>
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-muted-foreground/25 border-t-teal-600" />
            <p className="text-sm text-muted-foreground">Datei wird verarbeitet...</p>
          </>
        ) : isDragActive ? (
          <>
            <FileSpreadsheet className="h-10 w-10 text-teal-600" />
            <p className="text-sm font-medium text-teal-600">
              Datei hier ablegen
            </p>
          </>
        ) : (
          <>
            <Upload className="h-10 w-10 text-muted-foreground" />
            <div className="text-center">
              <p className="text-sm font-medium">
                CSV-Datei hierher ziehen
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                oder klicken zum Auswahlen (max. 5 MB)
              </p>
            </div>
          </>
        )}
      </div>

      {displayError && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{displayError}</span>
        </div>
      )}
    </div>
  )
}
