"""
Development seed script.
Creates demo tenant + admin user if they don't exist.
Run once after first migration: python seed_dev.py
"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from core.config import DB_URL
from core.security import hash_password
from core.database import init_pool, execute, fetchrow

DEMO_TENANT = {
    "name": "Demo Kft.",
    "slug": "demo",
    "plan": "enterprise",
}

DEMO_USER = {
    "email": "admin@demo.hu",
    "password": "admin123",
    "full_name": "Demo Admin",
    "role": "admin",
}

ALL_MODULES = [
    "email_agent", "invoice_agent", "document_agent",
    "crm_module", "calendar_module", "agent_builder",
]


async def seed():
    await init_pool()

    # Tenant
    existing = await fetchrow("SELECT id FROM tenants WHERE slug=$1", DEMO_TENANT["slug"])
    if existing:
        tenant_id = str(existing["id"])
        print(f"Tenant already exists: {tenant_id}")
    else:
        row = await fetchrow(
            "INSERT INTO tenants (name, slug, plan) VALUES ($1, $2, $3) RETURNING id",
            DEMO_TENANT["name"], DEMO_TENANT["slug"], DEMO_TENANT["plan"]
        )
        tenant_id = str(row["id"])
        print(f"Created tenant: {tenant_id}")

    # User
    existing_user = await fetchrow(
        "SELECT id FROM users WHERE email=$1 AND tenant_id=$2",
        DEMO_USER["email"], tenant_id
    )
    if existing_user:
        print(f"User already exists: {DEMO_USER['email']}")
    else:
        await execute(
            """INSERT INTO users (tenant_id, email, hashed_password, full_name, role)
               VALUES ($1, $2, $3, $4, $5)""",
            tenant_id,
            DEMO_USER["email"],
            hash_password(DEMO_USER["password"]),
            DEMO_USER["full_name"],
            DEMO_USER["role"],
        )
        print(f"Created user: {DEMO_USER['email']} / {DEMO_USER['password']}")

    # Feature flags — enable all for demo tenant
    for module in ALL_MODULES:
        await execute(
            """INSERT INTO tenant_features (tenant_id, module, enabled, enabled_at)
               VALUES ($1, $2, TRUE, NOW())
               ON CONFLICT (tenant_id, module) DO NOTHING""",
            tenant_id, module
        )
    print(f"Enabled modules: {', '.join(ALL_MODULES)}")

    print("\nSeed complete.")
    print(f"  Login: {DEMO_USER['email']}")
    print(f"  Password: {DEMO_USER['password']}")


if __name__ == "__main__":
    asyncio.run(seed())
