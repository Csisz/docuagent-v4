/**
 * Shown when a user tries to access a disabled module.
 */
const MODULE_NAMES = {
  invoice_agent:  "Invoice Agent",
  email_agent:    "Email Agent",
  document_agent: "Document Agent",
}

export default function UpgradePage({ module }) {
  const name = MODULE_NAMES[module] ?? module
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
      <div className="text-5xl mb-5">â—</div>
      <h2 className="text-[20px] font-semibold text-foreground mb-2">{name} nincs aktivĂˇlva</h2>
      <p className="text-[14px] text-muted-foreground max-w-sm mb-6">
        Ez a modul az Ă–n csomagjĂˇban nem Ă©rhetĹ‘ el. Vegye fel a kapcsolatot az adminisztrĂˇtorral a modul aktivĂˇlĂˇsĂˇhoz.
      </p>
    </div>
  )
}
