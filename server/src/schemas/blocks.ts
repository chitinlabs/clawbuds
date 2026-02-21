import { z } from 'zod'

// -- Block type definitions --

export interface TextBlock {
  type: 'text'
  text: string
}

export interface LinkBlock {
  type: 'link'
  url: string
  preview?: {
    title: string
    description: string
    image?: string
    siteName?: string
  }
}

export interface ImageBlock {
  type: 'image'
  url: string
  alt?: string
  width?: number
  height?: number
}

export interface CodeBlock {
  type: 'code'
  code: string
  language?: string
}

export interface PollBlockInput {
  type: 'poll'
  question: string
  options: string[]
}

export interface PollBlock {
  type: 'poll'
  question: string
  options: string[]
  pollId: string
}

export type Block = TextBlock | LinkBlock | ImageBlock | CodeBlock | PollBlockInput | PollBlock

// -- Zod schemas --

export const TextBlockSchema = z.object({
  type: z.literal('text'),
  text: z.string().min(1).max(10000),
})

export const LinkBlockSchema = z.object({
  type: z.literal('link'),
  url: z.string().url(),
  preview: z
    .object({
      title: z.string(),
      description: z.string(),
      image: z.string().url().optional(),
      siteName: z.string().optional(),
    })
    .optional(),
})

export const ImageBlockSchema = z.object({
  type: z.literal('image'),
  url: z.string().url(),
  alt: z.string().max(500).optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
})

export const CodeBlockSchema = z.object({
  type: z.literal('code'),
  code: z.string().min(1).max(50000),
  language: z.string().max(50).optional(),
})

export const PollBlockInputSchema = z.object({
  type: z.literal('poll'),
  question: z.string().min(1).max(500),
  options: z.array(z.string().min(1).max(200)).min(2).max(10),
})

export const BlockSchema = z.discriminatedUnion('type', [
  TextBlockSchema,
  LinkBlockSchema,
  ImageBlockSchema,
  CodeBlockSchema,
  PollBlockInputSchema,
])

export const BlocksArraySchema = z.array(BlockSchema).min(1).max(20)
