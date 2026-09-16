import type { InputHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      data-slot="input"
      className={cn(
        'h-9 w-full rounded-full border border-line bg-white/80 px-3.5 text-[13px] text-text outline-none placeholder:text-text-3',
        className,
      )}
      {...props}
    />
  )
}

export { Input }
