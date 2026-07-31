# Signed reader session tokens proxied by the web app

Core Platform signs a reader session token naming either a Reader Account or an Anonymous Reader Session, and treats an unsigned or re-signed token as no identity at all. The web app keeps that token in an HttpOnly, SameSite=Lax cookie on its own origin and calls the reader boundary from `/api/reader` route handlers, so the token is never readable or forgeable from page scripts and the browser never sends a reader identity of its own.

This keeps reader sessions inside the modular monolith with no new infrastructure and no vendor, and it avoids cross-origin credentialed cookies between the web app and Core Platform. For the MVP the token is the only credential: there is no login, so losing the cookie loses access to that Reader Account. Adding a way to sign back in is a later decision that this one does not foreclose.
