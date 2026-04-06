# Deploying to Google Cloud Platform (with $300 Credits)

This guide is specifically tailored for using your GCP $300 free trial credits to host the CI/CD Engine. By using credits, you can provision a powerful machine rather than shrinking your app to fit the 1GB "Always Free" tier.

## 1. Create the Virtual Machine (VM)

1. Log into the Google Cloud Console and navigate to **Compute Engine -> VM instances**.
2. Click **Create Instance**.
3. **Name:** `cicd-engine-server`
4. **Region:** You can pick any region close to you (e.g., `us-central1`, `europe-west4`).
5. **Machine Configuration:** 
   - Series: `E2`
   - Machine type: Select **`e2-medium` (2 vCPU, 4 GB memory)**. *This costs about ~$25/month, which will safely just deduct from your $300 credits without charging your card.*
6. **Boot Disk:** 
   - Click "Change". Select **Ubuntu** as the Operating System and **Ubuntu 22.04 LTS** as the version. Leave size at 10GB or bump to 20GB.
7. **Firewall (CRITICAL):** 
   - Check the boxes for **Allow HTTP traffic** and **Allow HTTPS traffic**.
8. Click **Create** at the bottom.

## 2. Connect to the Server

Google Cloud makes SSH incredibly easy for Windows users. You don't need to manage `.pem` or `.key` files.
1. Once your VM has a green checkmark, look at the **Connect** column.
2. Click the **SSH** button. This will automatically open a secure terminal window right inside your browser!

## 3. Server Setup

Inside that black browser terminal window, run these exact commands to install Docker:
```bash
sudo apt update
sudo apt install -y docker.io docker-compose
sudo systemctl enable --now docker
sudo usermod -aG docker $USER
```
*(Close the SSH browser window and click the SSH button again to reconnect so the Docker permissions apply).*

## 4. Get Your Code

Since you are inside the server, download your codebase from GitHub:
```bash
git clone https://github.com/your-username/your-repo-name.git
cd your-repo-name
```
*(If your repo is private, you will need to generate a Personal Access Token on GitHub and use it as your password when git cloned.)*

## 5. Configure Secrets

Create your `.env` file:
```bash
cp .env.example .env
nano .env
```
Fill in your secrets:
- `JWT_SECRET`
- `GITHUB_WEBHOOK_SECRET`
- `FRONTEND_URL=http://<Your-VM-External-IP>`

*(Press `Ctrl+X`, then `Y`, then `Enter` to save and exit nano).*

## 6. Fire the Engine!

Run the production Docker Compose file:
```bash
docker-compose -f docker-compose.prod.yml up -d --build
```
*Docker will now download Postgres and Redis, and compile your Node Backend and React Frontend. This takes about 2-3 minutes.*

## 7. Database Migration & Admin Setup

Once the containers are successfully running, set up the database and your login account:
```bash
docker exec cicd_server_prod npm run migrate
docker exec -e ADMIN_EMAIL=you@example.com -e ADMIN_PASSWORD=your_secure_password cicd_server_prod npm run seed:admin
```

## 8. You are Live!
Type your server's External IP address directly into your web browser. You should see your CI/CD Engine login page! 
Log in with the admin credentials you just created above, and you're ready to wire up GitHub.
