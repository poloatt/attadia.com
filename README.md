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
| `www.attadia.com` | consulting (ATTA) |

`/atta` en el HQ se reescribe a `https://www.attadia.com/atta` (`vercel.json`).

En local, si no ponés `GOOGLE_CLIENT_*` en `.env`, el HQ toma los de `technologies/apps/backend/.env`.

En [Google Cloud → Credenciales](https://console.cloud.google.com/apis/credentials) agregá Authorized redirect URIs (mismo client que Foco):

- `http://localhost:4170/api/google/callback`
- `https://attadia.com/api/google/callback`

No hay que cambiar código en `/technologies`.
