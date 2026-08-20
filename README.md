# attadia.com

Intranet privada (HQ). Proyecto aparte de Technologies.

Login: **Google** (recomendado) o email/contraseña. Quién entra lo decide `data/admins.json`. Owner: `polo@attadia.com`.

```bash
copy .env.example .env
npm run dev
```

[http://localhost:4170](http://localhost:4170)

## Dominios (Vercel)

| Host | Proyecto |
|------|----------|
| `attadia.com` | **este HQ** |
| `atta.attadia.com` | consulting (ATTA) |

### DNS en GoDaddy (apex `attadia.com`)

El dominio raíz **no** usa CNAME. En Vercel → Domains → `attadia.com` vas a ver los records exactos; en GoDaddy suelen ser:

| Tipo | Nombre | Valor |
|------|--------|--------|
| **A** | `@` | `76.76.21.21` |
| **CNAME** (opcional `www`) | `www` | `cname.vercel-dns.com` |

Subdominios (`atta`, `foco`, etc.) sí van con **CNAME** al valor que te muestre Vercel (casi siempre `cname.vercel-dns.com`).

En local, si no ponés `GOOGLE_CLIENT_*` en `.env`, el HQ toma los de `technologies/apps/backend/.env`.

En [Google Cloud → Credenciales](https://console.cloud.google.com/apis/credentials) agregá Authorized redirect URIs (mismo client que Foco):

- `http://localhost:4170/api/google/callback`
- `https://attadia.com/api/google/callback`

No hay que cambiar código en `/technologies`.
