# 01 — MariaDB Setup on Synology DS713+

## Step 1: Install MariaDB from Package Center

1. Open **DSM** in your browser → `http://192.168.1.252:5000`
2. Go to **Package Center**
3. Search for **MariaDB 10**
4. Click **Install**
5. Set a **root password** when prompted — save this securely
6. Leave the default port **3307** (Synology uses 3307, not 3306)
7. Click **Apply** and wait for installation to complete

> **Note:** DSM 6.2.4 on DS713+ provides MariaDB 10 via Package Center. If MariaDB 10 is not available, install **MariaDB 5** instead — the schema is compatible with both.

## Step 2: Enable TCP/IP Networking

MariaDB on Synology listens on TCP by default after installation. Verify:

1. Go to **Package Center** → **MariaDB 10** → **Open**
2. Confirm the port is set to **3307**
3. Ensure **Enable TCP/IP connection** is checked

## Step 3: Connect via SSH

```bash
ssh admin@192.168.1.252
```

Switch to root:

```bash
sudo -i
```

Connect to MariaDB:

```bash
mysql -u root -p --port 3307
```

Enter the root password you set during installation.

## Step 4: Create the Database

```sql
CREATE DATABASE quartier_bikes
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
```

## Step 5: Create the Application User

```sql
CREATE USER 'bikeapp'@'localhost' IDENTIFIED BY 'CHOOSE_A_STRONG_PASSWORD';

GRANT SELECT, INSERT, UPDATE, DELETE
  ON quartier_bikes.*
  TO 'bikeapp'@'localhost';

FLUSH PRIVILEGES;
```

> **Important:** Replace `CHOOSE_A_STRONG_PASSWORD` with a real password. Record it — you will need it for the `.env` file.

## Step 6: Import the Schema

From SSH (not inside the mysql prompt):

```bash
mysql -u root -p --port 3307 quartier_bikes < /volume1/web/quartier-bike-id/db/schema.sql
```

## Step 7: Verify the Tables

```bash
mysql -u bikeapp -p --port 3307 quartier_bikes -e "SHOW TABLES;"
```

Expected output:

```
+----------------------------+
| Tables_in_quartier_bikes   |
+----------------------------+
| bicycles                   |
| contact_messages           |
| scans                      |
| users                      |
+----------------------------+
```

## Step 8: Update .env

Set the following in your `.env` file:

```
DB_HOST=localhost
DB_PORT=3307
DB_USER=bikeapp
DB_PASS=CHOOSE_A_STRONG_PASSWORD
DB_NAME=quartier_bikes
```

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `Can't connect to local MySQL server through socket` | Use `--port 3307` and `--protocol=tcp` flags |
| `Access denied for user` | Double-check password and that GRANT was run with FLUSH PRIVILEGES |
| MariaDB not in Package Center | Your DSM version may need a manual `.spk` install — check Synology archive |
| Connection refused from app | Ensure the app uses port 3307, not 3306 |
