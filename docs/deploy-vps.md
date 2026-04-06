---
# Deploying to a VPS using Docker Compose

This guide explains how to deploy your CI/CD Engine to any blank Linux VPS (e.g., AWS EC2, DigitalOcean Droplet, Hetzner, etc.) using Docker Compose.

## 1. Prerequisites
- A Linux VPS instance running Ubuntu 22.04 (or similar).
- Port `80` (HTTP) open in the VPS firewall/security group.
- Port `22` (SSH) open.

### 🔥 Oracle Cloud Always Free Specifics
If you are using the Oracle Cloud ARM (Ampere A1) or AMD Micro instance:
1. **VCN Ingress Rules**: You MUST go to your OCI Dashboard -> Networking -> Virtual Cloud Networks -> Default Security List -> Add Ingress Rule. Add a rule for Destination Port `80` and `443` (CIDR `0.0.0.0/0`).
2. **OS Firewall (iptables)**: Oracle's default Ubuntu images block port 80 at the OS level even if the VCN allows it. After SSH-ing in, run this to open port 80 permanently:
```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo netfilter-persistent save
```
3. **Architecture**: Oracle Ampere A1 instances are `linux/arm64`. Everything in our `docker-compose.prod.yml` (Postgres, Redis, Node, Nginx) natively supports `arm64` and will build perfectly.

## 2. Server Setup

SSH into your new VPS:
(For Oracle Ubuntu images, your user is `ubuntu`. For Oracle Linux, your user is `opc`).
```bash
ssh ubuntu@your-server-ip
```

Install Docker and Docker Compose:
```bash
sudo apt update
sudo apt install -y docker.io docker-compose
sudo systemctl enable --now docker
sudo usermod -aG docker $USER
```
*(Logout and log back in, or run `newgrp docker` so you don't need to use `sudo` for `docker` commands).*

## 3. Upload Your Code

Clone your repository or upload your files to the server. For example:
```bash
git clone https://github.com/your-username/cicd-engine.git
cd cicd-engine
```

## 4. Configure Environment Variables

Create your production environment file from the example:
```bash
cp .env.example .env
```

Edit the `.env` file using `nano .env`:
```env
# Required for Auth
JWT_SECRET=generate_a_random_64_char_string_here

# Required for GitHub Webhooks
GITHUB_WEBHOOK_SECRET=your_github_webhook_secret

# The URL of this VPS (used for Slack links, etc.)
FRONTEND_URL=http://your-server-ip-or-domain

# (Optional) Slack
SLACK_WEBHOOK_URL=your_slack_webhook

# Note: REDIS_URL and DATABASE_URL are hardcoded in docker-compose.prod.yml
# and will override any local values in .env.
```

## 5. Deploy the Stack

Run the production Docker Compose file:
```bash
docker-compose -f docker-compose.prod.yml up -d --build
```

This command will:
- Start PostgreSQL and Redis containers.
- Build the Node.js backend (`server`) container.
- Build the frontend bundle and serve it via NGINX (`frontend`).
- Build and run the pipeline executor (`worker`).

## 6. Database Migration & Admin Setup

Once the containers are running, execute the initial database migration:
```bash
docker exec cicd_server_prod npm run migrate
```

Next, create your first admin user account to access the dashboard:
```bash
docker exec -e ADMIN_EMAIL=admin@example.com -e ADMIN_PASSWORD=your_secure_password cicd_server_prod npm run seed:admin
```

## 7. Update Webhooks

1. Go to your GitHub repository -> Settings -> Webhooks.
2. Add a webhook pointing to: `http://your-server-ip/webhook/github`
3. Content type: `application/json`
4. Set the Secret to match your `GITHUB_WEBHOOK_SECRET`.

## 8. Verification

1. Open a browser and navigate to `http://your-server-ip`.
2. Log in using the admin account you just created.
3. Push a commit to your linked GitHub repository.
4. Watch the pipeline trigger, execute using the attached Docker daemon, and display results in the dashboard.
