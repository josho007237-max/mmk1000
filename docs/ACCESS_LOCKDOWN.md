# Cloudflare Access Lockdown (Dev + Prod)

## Steps
1) Go to Cloudflare Zero Trust → Access → Applications → Add → **Self-hosted**.
2) Create app for `mmk1000-dev.bn9.app`.
3) Policies:
   - Add an **Allow** policy with **Email** conditions (specific emails only).
   - Deny by default (no other allow rules).
4) Repeat the same setup for `mmk1000.bn9.app`.

## Notes
- Do not use an **Everyone** policy.
- If no allow rule matches, access is denied by default.
