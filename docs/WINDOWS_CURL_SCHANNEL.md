# Windows curl Schannel Revocation Error

## Problem

On Windows, the built-in `curl.exe` typically uses Schannel for TLS. In some environments, Schannel tries to check certificate revocation status and fails with an error like `CRYPT_E_NO_REVOCATION_CHECK`. This usually means the system cannot reach the revocation endpoint (CRL/OCSP) because of network restrictions or proxy rules.

## Workaround

Use `--ssl-no-revoke` to skip the revocation check:

```bash
curl --ssl-no-revoke https://mmk1000-dev.bn9.app/
```

This avoids the Schannel revocation failure and allows the request to proceed when the revocation service is unreachable.
