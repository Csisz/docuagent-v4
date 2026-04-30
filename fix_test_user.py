# fix_test_user.py
from passlib.context import CryptContext
import subprocess

pwd = CryptContext(schemes=["bcrypt"]).hash("admin123")
sql = f"UPDATE users SET hashed_password='{pwd}' WHERE email='test@test.hu';"
result = subprocess.run(
    ["docker","exec","-i","docuagent_v4-postgres-1","psql","-U","postgres","-d","docuagent_v4","-c", sql],
    capture_output=True, text=True
)
print(result.stdout)
print(result.stderr)