# DocuAgent V4 — Admin oldal implementáció
# Telepítési sorrend

## 1. DB migration futtatása

docker exec -i docuagent_v4-postgres-1 psql -U postgres -d docuagent < db/migrations/005_superadmin.sql


## 2. Backend — új fájl

COPY:  backend/core_api/admin.py  (új fájl, nincs meglévő ütközés)


## 3. Backend — main.py módosítás (2 sor)

Lásd: MAIN_PY_PATCH.txt
Hozzáadni a meglévő router importok után:

  from core_api.admin import router as admin_router
  app.include_router(admin_router)


## 4. Backend — core_api/auth.py módosítás

Lásd: AUTH_PY_PATCH.txt
- login token payload: + "is_superadmin" mező
- login response user dict: + "is_superadmin" mező


## 5. Frontend — új fájlok (közvetlen COPY, nincs ütközés)

  src/core/auth/AdminRoute.jsx
  src/pages/admin/AdminPage.jsx
  src/pages/admin/tabs/TenantsTab.jsx
  src/pages/admin/tabs/UsersTab.jsx
  src/pages/admin/tabs/AuditTab.jsx
  src/pages/admin/tabs/UsageTab.jsx


## 6. Frontend — meglévő fájlok módosítása

  src/core/auth/AuthContext.jsx       → AUTH_CONTEXT_PATCH.txt (isSuperadmin érték hozzáadása)
  src/shell/layout/Sidebar.jsx        → SIDEBAR_PATCH.txt (Shield ikon + /admin nav + badge)
  src/App.jsx                         → APP_JSX_PATCH.txt (AdminRoute + AdminPage import és route)
  src/index.css                       → INDEX_CSS_PATCH.txt (input-base utility class)


## 7. Docker restart (backend)

docker cp backend/core_api/admin.py docuagent_v4-backend-1:/app/core_api/admin.py
docker restart docuagent_v4-backend-1


## 8. Első superadmin beállítása

docker exec -i docuagent_v4-postgres-1 psql -U postgres -d docuagent -c \
  "UPDATE users SET is_superadmin=TRUE WHERE email='YOUR_EMAIL_HERE';"


## Architektúra összefoglaló

Hozzáférési szintek:
  - role=admin        → Users, Audit, Usage saját tenant
  - is_superadmin     → mindez + Tenants tab + cross-tenant nézet + platform stats

Endpoint-ok:
  GET  /admin/tenants                       superadmin
  GET  /admin/tenants/{id}                  superadmin
  PATCH /admin/tenants/{id}                 superadmin
  POST /admin/tenants/{id}/modules          superadmin
  GET  /admin/tenants/{id}/users            admin (saját) + superadmin (bárki)
  POST /admin/tenants/{id}/users            admin (saját) + superadmin (bárki)
  PATCH /admin/tenants/{id}/users/{uid}     admin (saját) + superadmin (bárki)
  DELETE /admin/tenants/{id}/users/{uid}    admin (saját) + superadmin (bárki)
  GET  /admin/audit                         admin (saját) + superadmin (cross-tenant szűrő)
  GET  /admin/usage                         admin (saját) + superadmin (platform rollup)
  GET  /admin/stats                         superadmin
