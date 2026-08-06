"use client"

import { useId, useState } from "react"
import { useMutation } from "convex/react"
import { api } from "@/convex/_generated/api"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Upload, FileText, X, Loader2, Image } from "lucide-react"
import { toast } from "sonner"
import { Id } from "@/convex/_generated/dataModel"

interface FileUploadProps {
    onUpload?: (storageId: Id<"_storage">) => void
    onFileUploaded?: (storageId: Id<"_storage">) => void
    accept?: string | string[]
    maxSize?: number
    maxSizeInMB?: number
    label?: string
    description?: string
    required?: boolean
    disabled?: boolean
    children?: React.ReactNode
}

export function FileUpload({
                               onUpload,
                               onFileUploaded,
                               accept = "image/*",
                               maxSize,
                               maxSizeInMB,
                               label,
                               description,
                               required = false,
                               disabled = false,
                               children,
                           }: FileUploadProps) {
    const [file, setFile] = useState<File | null>(null)
    const [uploading, setUploading] = useState(false)
    const [dragOver, setDragOver] = useState(false)

    const generateUploadUrl = useMutation(api.files.generateUploadUrl)

    const maxSizeBytes = maxSize || (maxSizeInMB ? maxSizeInMB * 1024 * 1024 : 5 * 1024 * 1024)

    const handleUploadComplete = onUpload || onFileUploaded

    const acceptTypes = Array.isArray(accept) ? accept : [accept]

    const validateFile = (file: File): boolean => {
        const isValidType = acceptTypes.some(type => {
            if (type === "image/*") {
                return file.type.startsWith('image/')
            }
            if (type === "application/pdf") {
                return file.type === 'application/pdf'
            }
            return file.type.match(type.replace('*', '.*'))
        })

        if (!isValidType) {
            const acceptedTypes = acceptTypes.join(', ')
            toast.error(`Please upload a file of type: ${acceptedTypes}`)
            return false
        }

        if (file.size > maxSizeBytes) {
            const maxSizeMB = (maxSizeBytes / (1024 * 1024)).toFixed(1)
            toast.error(`File size must be less than ${maxSizeMB}MB`)
            return false
        }

        return true
    }

    const handleFileChange = async (selectedFile: File) => {
        if (!validateFile(selectedFile)) return

        setFile(selectedFile)
        await uploadFile(selectedFile)
    }

    const uploadFile = async (fileToUpload: File) => {
        try {
            setUploading(true)

            const postUrl = await generateUploadUrl()

            const result = await fetch(postUrl, {
                method: "POST",
                headers: { "Content-Type": fileToUpload.type },
                body: fileToUpload,
            })

            if (!result.ok) {
                throw new Error("Upload failed")
            }

            const { storageId } = await result.json()
            handleUploadComplete?.(storageId)
            toast.success("File uploaded successfully")

        } catch (error) {
            console.error("Upload error:", error)
            toast.error("Failed to upload file")
            setFile(null)
        } finally {
            setUploading(false)
        }
    }

    const removeFile = () => {
        setFile(null)
    }

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault()
        setDragOver(true)
    }

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault()
        setDragOver(false)
    }

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault()
        setDragOver(false)

        const droppedFile = e.dataTransfer.files[0]
        if (droppedFile) {
            handleFileChange(droppedFile)
        }
    }

    // Stable across server and client so the label stays bound to the input.
    const fileInputId = useId()

    if (children) {
        return (
          <div className="space-y-2">
              {label && (
                <Label className="text-sm font-medium">
                    {label} {required && <span className="text-red-500">*</span>}
                </Label>
              )}

              {description && (
                <p className="text-xs text-muted-foreground">{description}</p>
              )}

              <input
                type="file"
                accept={acceptTypes.join(',')}
                onChange={(e) => {
                    const selectedFile = e.target.files?.[0]
                    if (selectedFile) handleFileChange(selectedFile)
                }}
                className="hidden"
                id={fileInputId}
                disabled={disabled || uploading}
              />

              <label
                htmlFor={fileInputId}
                className={disabled || uploading ? "cursor-not-allowed" : "cursor-pointer"}
              >
                  {children}
              </label>

              {uploading && (
                <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Uploading...</span>
                </div>
              )}
          </div>
        )
    }

    return (
      <div className="space-y-2">
          {label && (
            <Label className="text-sm font-medium">
                {label} {required && <span className="text-red-500">*</span>}
            </Label>
          )}

          {description && (
            <p className="text-xs text-muted-foreground">{description}</p>
          )}

          {!file ? (
            <div
              className={`
            relative border-2 border-dashed rounded-lg p-2 text-center transition-colors
            ${dragOver
                ? "border-primary bg-primary/5"
                : "border-muted-foreground/25 hover:border-muted-foreground/50"
              }
            ${disabled || uploading ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
          `}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
                <Upload className="h-6 w-6 mx-auto mb-1 text-muted-foreground" />
                <p className="text-xs text-muted-foreground mb-1">
                    Click to upload or drag and drop
                </p>
                <p className="text-xs text-muted-foreground">
                    {acceptTypes.join(', ').toUpperCase()} (max {(maxSizeBytes / (1024 * 1024)).toFixed(1)}MB)
                </p>
                <input
                  type="file"
                  accept={acceptTypes.join(',')}
                  onChange={(e) => {
                      const selectedFile = e.target.files?.[0]
                      if (selectedFile) handleFileChange(selectedFile)
                  }}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  disabled={disabled || uploading}
                />
            </div>
          ) : (
            <div className="border rounded-lg p-2 flex items-center justify-between">
                <div className="flex items-center space-x-3">
                    {file.type.startsWith('image/') ? (
                      // eslint-disable-next-line jsx-a11y/alt-text
                      <Image className="h-8 w-8 text-blue-500" />
                    ) : (
                      <FileText className="h-8 w-8 text-blue-500" />
                    )}
                    <div>
                        <p className="text-sm font-medium">{file.name}</p>
                        <p className="text-xs text-muted-foreground">
                            {(file.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                    </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={removeFile}
                  disabled={disabled || uploading}
                >
                    <X className="h-4 w-4" />
                </Button>
            </div>
          )}

          {uploading && (
            <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Uploading...</span>
            </div>
          )}
      </div>
    )
}