export default function ReplyEditor({ value, onChange }) {
  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="Válasz szövege..."
        rows={7}
        className="w-full px-4 py-3 text-[13px] text-foreground bg-transparent resize-none focus:outline-none placeholder:text-muted-foreground/50"
      />
      <div className="flex items-center justify-between px-4 py-2 border-t border-border bg-muted/20">
        <span className="text-[11px] text-muted-foreground tabular-nums">{value.length} karakter</span>
      </div>
    </div>
  )
}
