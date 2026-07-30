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
8. **Inbound ports:** allow **SSH (22)**, **HTTP (80)**, and **HTTPS (443)**.
   (443 is required — Caddy serves the real cert there; see step 6a.)
9. Review + Create. Wait a few minutes, then note the **Public IP address**.

   Already created the VM with only 80 open? Portal → your VM →
   **Networking** → **Network settings** → **Add inbound port rule** →
   destination port `443`, protocol TCP, allow.

---

## 3. Get a stable name for your link (important for sharing with companies)

A raw IP address looks unprofessional and can change if you ever recreate the
VM. Give it a free Azure DNS label instead:

Portal → your VM → **Networking** → click the **public IP resource** → 
**Configuration** → set a **DNS name label**, e.g. `yourname-chatapp`.

Your permanent link becomes:
```
https://yourname-chatapp.<region>.cloudapp.azure.com
```
Use *this* URL — not the raw IP — anywhere you share the project (resume,
application forms, README). It survives VM restarts. (It's `https://` once you
set up Caddy in step 6a — until then it's `http://`.)

---

## 4. Install Docker on the VM

SSH in (Azure Ubuntu images have no extra local firewall by default, so unlike
Oracle you generally don't need iptables commands here):
```bash
ssh azureuser@yashchat-app.malaysiawest.cloudapp.azure.com
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
- `CLIENT_URL=` your exact frontend origin, **no trailing slash** — e.g. if the
  frontend is on Vercel: `CLIENT_URL=https://yash-chat-app-brown.vercel.app`.
  This has to match exactly or CORS rejects every request from the browser.
- `NODE_ENV=production` — required if the frontend is on a *different* domain
  than the backend (e.g. Vercel + Azure, as here). Cross-site auth cookies only
  work with `SameSite=None; Secure`, which the app only sets when
  `NODE_ENV=production` (see `backend/src/lib/utils.js`) — and `Secure` only
  works over real HTTPS, which is why step 6a (Caddy) isn't optional in this
  split-domain setup, unlike the single-VM Oracle guide.

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

Then do step 6a below before sharing the link — without it, a browser-based
frontend on a different domain (Vercel) can't log in against this backend.

---

## 6a. Real HTTPS with Caddy (required for a split-domain frontend/backend)

If your frontend is on the *same* origin as the backend (old single-VM setup),
plain `http://` is fine. If your frontend is on a **different domain** — e.g.
Vercel — the browser will (a) block "mixed content" API calls from an
`https://` page to an `http://` API, and (b) refuse to send the auth cookie
cross-site unless it's `Secure`, which requires real HTTPS. So this step is
mandatory for that setup, not just polish.

The repo already ships a `Caddyfile` and a `caddy` service in
`docker-compose.prod.yml` that sits in front of `nginx` and auto-provisions a
free Let's Encrypt certificate for your Azure DNS name — no manual cert
handling required.

1. Make sure port **443** is open in the VM's NSG (step 2, or add it now via
   Networking → Add inbound port rule).
2. On the VM, pull the latest code (this fixes the compose file and adds the
   `Caddyfile`):
   ```bash
   cd ~/Scalable-Chat-APP
   git pull
   ```
3. Edit `backend/.env` on the VM per the notes in step 5 above
   (`CLIENT_URL` = your Vercel URL, `NODE_ENV=production`).
4. Relaunch — Caddy will request the certificate automatically on first boot
   (needs port 80 reachable for the ACME challenge, which it already is):
   ```bash
   docker compose -f docker-compose.prod.yml up -d --build
   docker compose -f docker-compose.prod.yml logs -f caddy
   ```
   Watch the `caddy` logs for `certificate obtained successfully` — usually
   takes a few seconds.
5. Verify:
   ```bash
   curl https://yourname-chatapp.<region>.cloudapp.azure.com/healthz   # -> ok
   ```
   Open the same URL in a real browser too — it should show a valid padlock,
   no warning. That's the definitive check; a warning means the DNS name in
   `Caddyfile` doesn't match the VM's actual DNS label, or port 80/443 isn't
   reachable from the internet (re-check the NSG rule).

**This is the link to put on your resume / job applications:**
```
https://yourname-chatapp.<region>.cloudapp.azure.com
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

## Deploying the frontend separately (e.g. Vercel)

If the frontend lives on its own domain instead of being served by this VM:

1. `frontend/.env.production` in the repo already sets `VITE_API_URL` to this
   backend's `/api` path — Vercel picks it up automatically on `vite build`,
   no dashboard env-var config needed. Update it (and `frontend/.env`) if your
   DNS name or region differs.
2. `frontend/vercel.json` adds the SPA rewrite so client-side routes (e.g.
   `/dashboard`) don't 404 on a hard refresh.
3. On the backend VM, set `CLIENT_URL` in `backend/.env` to the exact Vercel
   URL and `NODE_ENV=production` (step 5), then do step 6a (Caddy/HTTPS) —
   both are required, not optional, once frontend and backend are on different
   domains. See the cross-origin cookie note in `backend/src/lib/utils.js`.

## Optional next steps

- **Load testing against it:** identical to the Oracle guide — run k6 from your
  laptop with `ARCJET_MODE=DRY_RUN`, pointed at your Azure URL instead of an IP.
