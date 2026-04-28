/**
 * UsersTab — User management
 * - tenant admin: manages users in own tenant
 * - superadmin: selects target tenant first, then manages
 */
import { useState, useEffect, useCallback } from "react"
import { api } from "@/core/api"
import { useAuth } from "@/core/auth/AuthContext"
import {
  UserPlus, Shield, CheckCircle2, XCircle,
  MoreVertical, Trash2, Edit2, X
} from "lucide-react"

const ROLES = ["admin", "agent", "viewer", "senior_approver"]

const ROLE_COLORS = {
  admin:            "bg-purple-50 text-purple-700",
  agent:            "bg-blue-50 text-blue-700",
  viewer:           "bg-gray-100 text-gray-600",
  senior_approver:  "bg-amber-50 text-amber-700",
}

export default function UsersTab({ tenantId, isSuperadmin }) {
  const { user: me } = useAuth()
  const [users,   setUsers]   = useState([])
  const [loading, setLoading] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [editUser, setEditUser] = useState(null)  // user being edited
  const [form,    setForm]    = useState({ email: "", password: "", full_name: "", role: "agent", is_superadmin: false })
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState(null)

  const load = useCallback(async () => {
    if (!tenantId) return
    setLoading(true)
    try {
      const res = await api.get(`/admin/tenants/${tenantId}/users`)
      setUsers(res.data.users ?? [])
    } catch(e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [tenantId])

  useEffect(() => { load() }, [load])

  function openAdd() {
    setForm({ email: "", password: "", full_name: "", role: "agent", is_superadmin: false })
    setError(null)
    setShowAdd(true)
    setEditUser(null)
  }

  function openEdit(u) {
    setEditUser(u)
    setForm({ email: u.email, password: "", full_name: u.full_name ?? "", role: u.role, is_superadmin: u.is_superadmin ?? false })
    setError(null)
    setShowAdd(false)
  }

  async function handleSave() {
    if (!tenantId) return
    setSaving(true)
    setError(null)
    try {
      if (editUser) {
        // PATCH existing
        const payload = {}
        if (form.role !== editUser.role) payload.role = form.role
        if (form.full_name !== editUser.full_name) payload.full_name = form.full_name
        if (isSuperadmin && form.is_superadmin !== editUser.is_superadmin)
          payload.is_superadmin = form.is_superadmin
        await api.patch(`/admin/tenants/${tenantId}/users/${editUser.id}`, payload)
        setEditUser(null)
      } else {
        // POST new
        if (!form.email || !form.password) { setError("Email és jelszó kötelező"); return }
        await api.post(`/admin/tenants/${tenantId}/users`, form)
        setShowAdd(false)
      }
      load()
    } catch(e) {
      setError(e.response?.data?.detail ?? "Hiba történt")
    } finally {
      setSaving(false)
    }
  }

  async function deactivate(userId) {
    if (!window.confirm("Biztosan deaktiválja ezt a felhasználót?")) return
    await api.delete(`/admin/tenants/${tenantId}/users/${userId}`)
    load()
  }

  async function reactivate(userId) {
    await api.patch(`/admin/tenants/${tenantId}/users/${userId}`, { is_active: true })
    load()
  }

  if (!tenantId) {
    return (
      <div className="flex items-center justify-center h-40 text-[12px] text-muted-foreground">
        Válassz egy tenantet a Tenants fülön.
      </div>
    )
  }

  return (
    <div className="space-y-4">

      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <p className="text-[12px] text-muted-foreground">{users.length} felhasználó</p>
        <button
          onClick={openAdd}
          className="flex items-center gap-1.5 h-8 px-3 text-[12px] font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
        >
          <UserPlus size={12} /> Új felhasználó
        </button>
      </div>

      {/* Add / Edit form */}
      {(showAdd || editUser) && (
        <div className="bg-card border border-border rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-[13px] font-semibold text-foreground">
              {editUser ? "Felhasználó szerkesztése" : "Új felhasználó"}
            </h3>
            <button onClick={() => { setShowAdd(false); setEditUser(null) }}>
              <X size={14} className="text-muted-foreground hover:text-foreground" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Email" required>
              <input
                type="email"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                disabled={!!editUser}
                className="input-base disabled:opacity-50 disabled:cursor-not-allowed"
                placeholder="user@company.com"
              />
            </Field>
            {!editUser && (
              <Field label="Jelszó" required>
                <input
                  type="password"
                  value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  className="input-base"
                  placeholder="••••••••"
                />
              </Field>
            )}
            <Field label="Teljes név">
              <input
                type="text"
                value={form.full_name}
                onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
                className="input-base"
                placeholder="Kis János"
              />
            </Field>
            <Field label="Szerepkör">
              <select
                value={form.role}
                onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                className="input-base"
              >
                {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </Field>
          </div>

          {isSuperadmin && (
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.is_superadmin}
                onChange={e => setForm(f => ({ ...f, is_superadmin: e.target.checked }))}
                className="rounded"
              />
              <span className="text-[12px] text-foreground flex items-center gap-1">
                <Shield size={11} className="text-purple-500" />
                Superadmin jogok (Agentify operátor)
              </span>
            </label>
          )}

          {error && (
            <p className="text-[12px] text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
          )}

          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="h-8 px-4 text-[12px] font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? "Mentés..." : "Mentés"}
            </button>
            <button
              onClick={() => { setShowAdd(false); setEditUser(null) }}
              className="h-8 px-4 text-[12px] rounded-lg border border-border hover:bg-muted"
            >
              Mégse
            </button>
          </div>
        </div>
      )}

      {/* User table */}
      {loading ? (
        <div className="text-center py-8 text-[12px] text-muted-foreground">Betöltés...</div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Felhasználó</th>
                <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Szerepkör</th>
                <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Utolsó belépés</th>
                <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Státusz</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {users.map(u => (
                <tr key={u.id} className={`hover:bg-muted/20 ${!u.is_active ? "opacity-50" : ""}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-gradient-to-br from-slate-400 to-slate-600 flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0">
                        {(u.full_name || u.email)[0].toUpperCase()}
                      </div>
                      <div>
                        <div className="font-medium text-foreground">
                          {u.full_name || "—"}
                          {u.is_superadmin && (
                            <Shield size={10} className="inline ml-1 text-purple-500" />
                          )}
                        </div>
                        <div className="text-[10px] text-muted-foreground">{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${ROLE_COLORS[u.role] ?? "bg-gray-100 text-gray-600"}`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {u.last_login
                      ? new Date(u.last_login).toLocaleDateString("hu-HU")
                      : "Soha"}
                  </td>
                  <td className="px-4 py-3">
                    {u.is_active
                      ? <span className="flex items-center gap-1 text-green-600"><CheckCircle2 size={12} /> Aktív</span>
                      : <span className="flex items-center gap-1 text-red-500"><XCircle size={12} /> Inaktív</span>
                    }
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {u.id !== me?.id && (
                        <>
                          <button
                            onClick={() => openEdit(u)}
                            className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                            title="Szerkesztés"
                          >
                            <Edit2 size={12} />
                          </button>
                          {u.is_active ? (
                            <button
                              onClick={() => deactivate(u.id)}
                              className="p-1.5 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600 transition-colors"
                              title="Deaktiválás"
                            >
                              <Trash2 size={12} />
                            </button>
                          ) : (
                            <button
                              onClick={() => reactivate(u.id)}
                              className="p-1.5 rounded hover:bg-green-50 text-muted-foreground hover:text-green-600 transition-colors"
                              title="Újraaktiválás"
                            >
                              <CheckCircle2 size={12} />
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-muted-foreground">
                    Nincs felhasználó
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function Field({ label, required, children }) {
  return (
    <div className="space-y-1">
      <label className="text-[11px] font-medium text-foreground">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}
