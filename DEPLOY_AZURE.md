# Deploying ChatAppScalable on Azure for Students (no credit card)

Goal: a **permanent, shareable link** for job applications — one that stays live
24/7 without requiring a credit card, since Oracle's card verification wasn't
accepting yours.

This reuses the exact same `docker-compose.prod.yml` from the Oracle guide — the
architecture (Kafka + Redis + 3 API instances + workers + nginx) doesn't change,
only the cloud provider and VM-provisioning steps do.

## Why Azure for Students, and what to expect

Azure for Students gives **$100 in credit, verified with just your school
email — genuinely no credit card at sign-up.** The catch: the truly "always
free" VM size (`B1s`, 1 GB RAM) is too small for this stack. Instead we'll use a
**B2s** (2 vCPU / 4 GB RAM), paid for out of the $100 credit — roughly **2–3
months of 24/7 uptime** depending on your region's pricing.

**Because no card is attached at all, there is no risk of a surprise charge.**
When the credit runs out, the VM simply stops — Azure cannot bill you further
without a payment method on file. Treat this as "3 months of free hosting,"
not "forever free." Worth knowing before a company checks your link months
later — plan to redeploy or upgrade before the credit runs dry (see the
monitoring step at the end).

---

## 1. Sign up (no card)

1. Go to https://azure.microsoft.com/free/students and click **Start free**.
2. Sign in / sign up with your **school email address** (not a personal
   Gmail/Outlook — it must be your college's domain).
3. Verify your student status (usually instant; occasionally needs a short
   manual review). Credit appears in your account immediately after.

---

## 2. Create the VM

1. Azure Portal → **Create a resource → Virtual Machine**.
2. **Resource group:** create new, e.g. `chatapp-rg`.
3. **VM name:** `chatapp-vm`.
4. **Region:** pick one close to you (e.g. Central India, East US) — avoid
   regions with known capacity issues if creation fails; just try another
   region.
5. **Image:** Ubuntu Server 22.04 LTS (or 24.04 LTS).
6. **Size:** click "See all sizes" → select **Standard_B2s** (2 vCPU, 4 GiB).
   *(Do not pick B1s — 1 GB RAM is not enough for Kafka + everything else.)*
7. **Authentication type:** SSH public key (paste yours, or let Azure generate
   one and download it — keep the `.pem` safe).
8. **Inbound ports:** allow **SSH (22)** and **HTTP (80)**.
9. Review + Create. Wait a few minutes, then note the **Public IP address**.

---

## 3. Get a stable name for your link (important for sharing with companies)

A raw IP address looks unprofessional and can change if you ever recreate the
VM. Give it a free Azure DNS label instead:

Portal → your VM → **Networking** → click the **public IP resource** → 
**Configuration** → set a **DNS name label**, e.g. `yourname-chatapp`.

Your permanent link becomes:
```
http://yourname-chatapp.<region>.cloudapp.azure.com
```
Use *this* URL — not the raw IP — anywhere you share the project (resume,
application forms, README). It survives VM restarts.

---

## 4. Install Docker on the VM

SSH in (Azure Ubuntu images have no extra local firewall by default, so unlike
Oracle you generally don't need iptables commands here):
```bash
ssh azureuser@
yashchat-app.malaysiawest.cloudapp.azure.com.cloudapp.azure.com
```

```bash
sudo apt-get update && sudo apt-get upgrade -y
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
newgrp docker
# Make sure Docker itself restarts automatically after any host reboot
# (Azure occasionally reboots VMs for host maintenance).
sudo systemctl enable docker
docker --version && docker compose version
```

---

## 5. Get the code onto the VM

```bash
git clone https://github.com/YashP1830/Scalable-Chat-APP.git
cd Scalable-Chat-APP
```

Copy your `.env` from your laptop (it's gitignored, so it won't come with the
clone):
```bash
# from your laptop, in the project folder
scp backend/.env azureuser@<your-dns-name>.cloudapp.azure.com:~/Scalable-Chat-APP/backend/.env
```

Edit `backend/.env` on the VM so:
- `MONGODB_URI` — add the VM's outbound IP (or `0.0.0.0/0` for simplicity) under
  MongoDB Atlas → Network Access, or Mongo will refuse the connection.
- `CLIENT_URL=http://yourname-chatapp.<region>.cloudapp.azure.com`
- `NODE_ENV=development` — needed so the auth cookie isn't marked `Secure`,
  which browsers would otherwise silently drop over plain HTTP. (If you add
  HTTPS later per the note at the end, switch this back to `production`.)

---

## 6. Launch the stack

```bash
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f db-worker analytics-worker
```

Kafka takes 30–60s to become ready — that's normal.

Verify from your laptop:
```bash
curl http://yourname-chatapp.<region>.cloudapp.azure.com/healthz   # -> ok
```

**This is the link to put on your resume / job applications:**
```
http://yourname-chatapp.<region>.cloudapp.azure.com
```

---

## 7. Keep it running reliably

Every container in `docker-compose.prod.yml` already has `restart:
unless-stopped`, and `systemctl enable docker` (step 4) means Docker itself
comes back after any host reboot. Together, the stack should self-heal without
you needing to SSH back in — but check on it periodically (`docker compose ps`)
after the first week to make sure nothing's stuck.

---

## 8. Monitor your credit (avoid the link going dead unexpectedly)

Portal → **Cost Management + Billing** → **Credits** shows your remaining
balance. Check it monthly. Since a B2s running 24/7 will consume the $100 over
roughly 2–3 months, set a personal reminder to check back around month 2 — if
you're getting close to $0, either move the deployment (repeat this guide on a
new subscription, e.g. a different Azure account or provider) or, if you have
income by then, add a small paid tier. Because there's no card attached, the
worst case is simply the site going offline — never an unexpected bill.

---

## Optional next steps

- **HTTPS:** a plain `http://` link works fine for demos, but for extra polish,
  put [Caddy](https://caddyserver.com/) in front of nginx with a free Let's
  Encrypt certificate — Caddy auto-provisions HTTPS for a domain/DNS name with
  almost no config. Needs a real domain or the `cloudapp.azure.com` DNS name
  from step 3.
- **Load testing against it:** identical to the Oracle guide — run k6 from your
  laptop with `ARCJET_MODE=DRY_RUN`, pointed at your Azure URL instead of an IP.
- **Frontend:** point `frontend/.env`'s `VITE_API_URL` at
  `http://yourname-chatapp.<region>.cloudapp.azure.com/api` to click through the
  UI locally against the live backend.
