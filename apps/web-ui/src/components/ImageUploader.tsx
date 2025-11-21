import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '@/store/use-app-store';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { formatBytes } from '@/lib/utils';
import { CloudArrowUpIcon, DocumentTextIcon, CheckCircleIcon } from '@heroicons/react/24/outline';

const signingSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  creator: z.string().min(1, 'Creator is required'),
  description: z.string().optional(),
  format: z.enum(['jpeg', 'png', 'webp']).optional(),
});

type FormData = z.infer<typeof signingSchema>;

interface ImageUploaderProps {
  onSubmit: (file: File, metadata: FormData) => void;
}

export function ImageUploader({ onSubmit }: ImageUploaderProps) {
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const { addRecentFile, addSigningHistory } = useAppStore();
  
  const {
    register,
    handleSubmit,
    reset: resetForm,
    formState: { errors, isValid },
  } = useForm<FormData>({
    resolver: zodResolver(signingSchema),
    defaultValues: {
      title: '',
      creator: '',
      description: '',
    },
  });

  const onFormSubmit = (data: FormData) => {
    if (!selectedFile) return;
    
    // Add to recent files and history
    addRecentFile({
      name: selectedFile.name,
      size: selectedFile.size,
    });
    
    addSigningHistory({
      fileName: selectedFile.name,
      status: 'pending',
    });
    
    // Submit to parent component for real-time processing
    onSubmit(selectedFile, data);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.type.startsWith('image/')) {
        setSelectedFile(file);
      }
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const reset = () => {
    setSelectedFile(null);
    resetForm();
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <Card className="w-full max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CloudArrowUpIcon className="h-6 w-6" />
            Upload Image for Signing
          </CardTitle>
          <CardDescription>
            Select an image file to sign with C2PA cryptographic certificate
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* File Upload Area */}
          <motion.div
            className={`relative border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              dragActive
                ? 'border-primary bg-primary/5'
                : 'border-muted-foreground/25 hover:border-primary/50'
            }`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <input
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
            
            <AnimatePresence mode="wait">
              {!selectedFile ? (
                <motion.div
                  key="upload"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="space-y-4"
                >
                  <CloudArrowUpIcon className="mx-auto h-12 w-12 text-muted-foreground" />
                  <div>
                    <p className="text-lg font-medium">Drop your image here</p>
                    <p className="text-sm text-muted-foreground">or click to browse</p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Supports: JPEG, PNG, WebP (Max 50MB)
                  </p>
                </motion.div>
              ) : (
                <motion.div
                  key="selected"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="space-y-4"
                >
                  <CheckCircleIcon className="mx-auto h-12 w-12 text-green-500" />
                  <div>
                    <p className="text-lg font-medium">{selectedFile.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {formatBytes(selectedFile.size)}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      reset();
                    }}
                  >
                    Remove
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          {/* Metadata Form */}
          <AnimatePresence>
            {selectedFile && (
              <motion.form
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                onSubmit={handleSubmit(onFormSubmit)}
                className="space-y-4"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label htmlFor="title" className="text-sm font-medium">
                      Title *
                    </label>
                    <Input
                      id="title"
                      placeholder="Enter image title"
                      {...register('title')}
                    />
                    {errors.title && (
                      <p className="text-sm text-destructive">{errors.title.message}</p>
                    )}
                  </div>
                  
                  <div className="space-y-2">
                    <label htmlFor="creator" className="text-sm font-medium">
                      Creator *
                    </label>
                    <Input
                      id="creator"
                      placeholder="Enter creator name"
                      {...register('creator')}
                    />
                    {errors.creator && (
                      <p className="text-sm text-destructive">{errors.creator.message}</p>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <label htmlFor="description" className="text-sm font-medium">
                    Description
                  </label>
                  <Input
                    id="description"
                    placeholder="Enter image description (optional)"
                    {...register('description')}
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="format" className="text-sm font-medium">
                    Output Format
                  </label>
                  <select
                    id="format"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    {...register('format')}
                  >
                    <option value="">Same as input</option>
                    <option value="jpeg">JPEG</option>
                    <option value="png">PNG</option>
                    <option value="webp">WebP</option>
                  </select>
                </div>

                <div className="flex gap-3 pt-4">
                  <Button
                    type="submit"
                    disabled={!isValid}
                    className="flex-1"
                  >
                    <DocumentTextIcon className="h-4 w-4 mr-2" />
                    Start Real-time Signing
                  </Button>
                  
                  <Button
                    type="button"
                    variant="outline"
                    onClick={reset}
                  >
                    Cancel
                  </Button>
                </div>
              </motion.form>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>
    </motion.div>
  );
}
