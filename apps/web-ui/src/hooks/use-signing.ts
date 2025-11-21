import { useMutation, useQuery } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import { z } from 'zod'

const signingSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  creator: z.string().min(1, 'Creator is required'),
  description: z.string().optional(),
  format: z.enum(['jpeg', 'png', 'webp']).optional(),
})

export type SigningMetadata = z.infer<typeof signingSchema>

interface SigningResult {
  success: boolean
  proofUrl?: string
  certificateUrl?: string
  manifestHash?: string
  error?: string
}

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export function useSigning() {
  const mutation = useMutation<SigningResult, Error, { file: File; metadata: SigningMetadata }>({
    mutationFn: async ({ file, metadata }) => {
      // Validate metadata
      const validated = signingSchema.parse(metadata)
      
      const formData = new FormData()
      formData.append('image', file)
      formData.append('metadata', JSON.stringify(validated))

      const response = await fetch(`${API_BASE}/sign`, {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: response.statusText }))
        throw new Error(error.message || `Signing failed: ${response.statusText}`)
      }

      return response.json()
    },
    onSuccess: (result) => {
      if (result.success) {
        toast.success('Image signed successfully!')
      } else {
        toast.error(result.error || 'Signing failed')
      }
    },
    onError: (error) => {
      toast.error(`Signing failed: ${error.message}`)
    },
  })

  return {
    signImage: mutation.mutate,
    isSigning: mutation.isPending,
    result: mutation.data,
    error: mutation.error,
    reset: mutation.reset,
  }
}

export function useSigningStatus() {
  return useQuery({
    queryKey: ['signing-status'],
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/health`)
      if (!response.ok) throw new Error('Failed to fetch status')
      return response.json()
    },
    refetchInterval: 30000, // Refetch every 30 seconds
  })
}
