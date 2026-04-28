import { BookOpen, Upload, Search, FileText, Lock } from "lucide-react"

export default function DocumentPage() {
  return (
    <div className="max-w-[1200px] mx-auto space-y-6">

      {/* Header */}
      <div className="pt-1 flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-semibold text-foreground tracking-tight">Documents</h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">Document analysis and RAG interface</p>
        </div>
        <button
          disabled
          className="flex items-center gap-2 h-9 px-4 bg-blue-600/50 text-white text-[13px] font-medium rounded-lg cursor-not-allowed opacity-60"
        >
          <Upload size={14} /> Upload Document
        </button>
      </div>

      {/* Search bar placeholder */}
      <div className="flex items-center gap-2 h-10 px-4 bg-card border border-border rounded-xl text-muted-foreground/50 cursor-not-allowed">
        <Search size={14} />
        <span className="text-[13px]">Search documents…</span>
      </div>

      {/* Coming soon card */}
      <div className="bg-card border border-border rounded-xl p-16 flex flex-col items-center justify-center text-center">
        <div className="w-16 h-16 rounded-2xl bg-teal-50 border border-teal-100 flex items-center justify-center mb-5">
          <BookOpen size={28} className="text-teal-500" />
        </div>
        <h2 className="text-[18px] font-semibold text-foreground mb-2">Document Agent</h2>
        <p className="text-[13px] text-muted-foreground max-w-[380px] leading-relaxed mb-6">
          Upload and analyse documents, extract structured data, and chat with your files using RAG-powered AI.
        </p>
        <div className="grid grid-cols-3 gap-3 w-full max-w-[480px]">
          {[
            { icon: Upload,   label: "Upload & Parse",   desc: "PDF, DOCX, images"      },
            { icon: FileText, label: "Extract Data",      desc: "AI-powered extraction"  },
            { icon: Search,   label: "Chat with Docs",   desc: "RAG Q&A interface"      },
          ].map(({ icon: Icon, label, desc }) => (
            <div key={label} className="bg-muted/50 border border-border rounded-xl p-4 flex flex-col items-center gap-2 opacity-60">
              <div className="w-9 h-9 rounded-lg bg-teal-50 border border-teal-100 flex items-center justify-center">
                <Icon size={16} className="text-teal-500" />
              </div>
              <p className="text-[12px] font-semibold text-foreground">{label}</p>
              <p className="text-[11px] text-muted-foreground">{desc}</p>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-1.5 mt-6 text-[12px] text-muted-foreground/60">
          <Lock size={12} />
          Coming in next release
        </div>
      </div>

    </div>
  )
}
