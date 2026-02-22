# Remote Control PWA — Roadmap

> Brainstorm session du 22/02/2026. Résumé des décisions features + UI/UX.

## Statut actuel (MVP v1 — DONE)

- Auth par PIN → session token
- WebSocket avec reconnect exponentiel
- Vue Projects (liste, sélection)
- Vue Chat (streaming SDK, tool use basique, permissions allow/deny)
- Vue Dashboard (temps today, projet actif, liste projets)
- Bottom nav 3 onglets
- UI redesignée (Industrial Luxury: JetBrains Mono + Outfit, gradients ambrés, animations staggered, grain overlay)

---

## Phase 2 — Chat enrichi & contrôles

### 2a. Tool use cards (comme ChatView desktop)
- Bash → afficher commande + output (collapsible)
- Write/Edit → afficher le fichier ciblé + snippet
- Read → afficher le nom du fichier lu
- **Ultra compact par défaut** : juste icône + nom tool + fichier/commande sur une ligne. Tap pour expand les détails.
- Même rendu visuel que le desktop, adapté mobile

### 2b. Model & Thinking switcher
- Accessible via le **menu '+'** dans la barre d'input du chat
- Changer le modèle mid-session (Sonnet, Opus, Haiku)
- Toggle extended thinking on/off
- Nouveau message WS : `settings:update` → côté serveur relayer au ChatService

### 2c. File diff viewer
- Quand Claude fait un Write/Edit, tap sur la card → ouvrir un viewer
- Afficher le **diff coloré** (avant/après) read-only
- **Syntax highlighting basique custom** (keywords, strings, comments — pas de lib externe)

### 2d. Chat style hybride
- **Bulles** pour le texte court (user = ambré à droite, assistant = dark à gauche)
- **Blocs full-width** quand il y a du code ou des tool use cards
- S'adapte automatiquement au contenu du message

### 2e. Permissions inline
- Les permissions apparaissent **inline dans le flux du chat** comme un message spécial
- Plus de card overlay séparée — c'est un "message" de type permission avec boutons Allow/Deny

### 2f. Scroll-to-bottom FAB
- Quand l'utilisateur scrolle vers le haut, un **bouton flottant** apparaît en bas à droite
- Tap = retour en bas du chat instantané
- Disparaît quand on est déjà en bas

---

## Phase 3 — Project hub

### 3a. Project = full-screen avec tabs
- Tap sur un projet → **full-screen dédié** au projet
- **Back button** : flèche en haut à gauche + swipe from left edge (les deux)
- **Header minimal** : juste le nom du projet + back button
- La **bottom nav se transforme dynamiquement** : les icônes changent avec animation pour devenir Chat / Terminal / Git (au lieu de Projects / Chat / Dashboard)

### 3b. Terminal
- Streamer l'output via WS (`terminal:output` events)
- Mode read-only par défaut, bouton pour activer l'input si besoin
- Nouveau message WS : `terminal:output` (server→client), `terminal:input` (client→server)

### 3c. Ouvrir terminal / worktree
- Quick actions depuis le project hub
- "Nouveau terminal" → crée un terminal sur le desktop pour ce projet
- "Worktree" → lister/créer/switcher de worktree git

---

## Phase 4 — Git quick actions

- Afficher dans le project hub : branche actuelle, fichiers modifiés, ahead/behind
- Quick actions :
  - **Pull** — un tap
  - **Push** — un tap (avec confirmation)
  - **Commit AI** — générer message avec AI + commit en un tap
  - **Voir diff** — ouvrir le diff viewer avec les changements en cours
- Messages WS : `git:status`, `git:pull`, `git:push`, `git:commit`

---

## Phase 5 — Mission Control

- **4ème onglet** dans la bottom nav : "Control"
- **Layout : liste avec statut** — cards empilées verticalement
- Chaque session = card avec :
  - Nom du projet
  - **Status badge coloré** : vert = actif, orange = attend permission, gris = idle, rouge = erreur
  - Dernière action / dernier message
  - Tap → naviguer vers cette session
- Permet de monitorer plusieurs projets simultanément

---

## Phase 6 — Features autonomes mobile

### 6a. Caméra → Chat
- Accessible via le **menu '+'** dans la barre d'input
- Prendre une photo (whiteboard, erreur écran, design, code sur papier)
- L'envoyer directement à Claude comme contexte dans le prompt
- Utilise `<input type="file" capture="camera">` (plus simple que getUserMedia)
- Le serveur reçoit l'image en base64 et l'injecte dans le prompt SDK

### 6b. Prompt templates / favoris
- Templates **configurables depuis le desktop** (Settings → Remote → Templates)
- Accessibles via le **menu '+'** dans la barre d'input
- Un tap = prompt envoyé immédiatement
- Exemples : "Fix les tests", "Review ce fichier", "Commit et push"
- Sync via WS : `templates:list` au connect

---

## Phase 7 — Notifications & ergonomie

### 7a. Push notifications OS
- Service Worker avec push notifications
- Notifier quand :
  - Claude a fini un long task
  - Une permission est demandée (use case killer)
  - Une erreur survient
- Vibration (`navigator.vibrate()`) en complément
- Nécessite : Service Worker push, VAPID keys

### 7b. Swipe gestures
- **Slide horizontal** pour naviguer entre les vues
- Détection tactile avec seuil de distance + vélocité
- **Animation slide** : les vues glissent comme des pages (cohérent avec le swipe)
- Cohabite avec le bottom nav (les deux fonctionnent)

### 7c. Haptic feedback
- `navigator.vibrate()` sur les actions importantes :
  - Envoyer un message (court pulse)
  - Autoriser/refuser permission (double pulse)
  - Changer de vue (micro pulse)

---

## Phase 8 — Sécurité

- Token session expire après **24h d'inactivité**
- Bouton "Déconnecter" visible dans le header ou les settings mobile
- Côté serveur : vérifier le timestamp du dernier message WS, invalider si > 24h
- Côté client : timer JS qui redirige vers l'écran PIN si inactif > 24h

---

## UI/UX Design System

### Principes
- **Dark only** — c'est l'identité de Claude Terminal, pas de light mode
- **Mobile-first** — tout est pensé pour le tactile, min 44px touch targets
- **Slide transitions** — navigation horizontale fluide entre les vues
- **Industrial Luxury** — JetBrains Mono pour les titres/code, Outfit pour le body

### Navigation
- **Bottom nav globale** (3 onglets : Projects, Chat/Mission Control, Dashboard)
- **Bottom nav projet** (3 onglets dynamiques : Chat, Terminal, Git) — remplace la nav globale avec animation
- **Swipe horizontal** entre les vues + bottom nav
- **Back button** (flèche haut-gauche) + **swipe from left edge** pour revenir

### Projets
- **Section "Récents"** en haut avec scroll horizontal
- **Liste complète** en dessous (cards verticales, design actuel)
- Tap → full-screen projet

### Chat
- **Style hybride** : bulles pour texte court, blocs full-width pour code/tools
- **Tool cards ultra compactes** : icône + tool name + cible, tap to expand
- **Permissions inline** dans le flux de messages
- **Menu '+'** dans la barre d'input : Caméra, Templates, Model picker
- **FAB scroll-to-bottom** quand on scrolle vers le haut
- **Syntax highlighting basique custom** (keywords, strings, comments)

### Mission Control
- **Liste verticale** de sessions avec status badges colorés
- Vert = actif, Orange = permission, Gris = idle, Rouge = erreur

---

## Ordre d'implémentation suggéré

1. **Phase 2a+2d+2e** — Tool cards compactes + chat hybride + permissions inline
2. **Phase 2b** — Model switcher via menu '+'
3. **Phase 2f** — FAB scroll-to-bottom
4. **Phase 3a+3b** — Project hub full-screen + terminal read-only
5. **Phase 7b** — Swipe gestures + slide transitions
6. **Phase 4** — Git quick actions
7. **Phase 8** — Sécurité (24h timeout + déconnexion)
8. **Phase 5** — Mission Control (4ème onglet)
9. **Phase 7c** — Haptic feedback
10. **Phase 6a** — Caméra → Chat
11. **Phase 6b** — Prompt templates
12. **Phase 7a** — Push notifications OS
13. **Phase 2c** — File diff viewer

---

## Décisions actées

### Features
| Question | Réponse |
|----------|---------|
| Terminal mobile | Read-only + input optionnel |
| Git depuis mobile | Quick actions (pull, push, commit AI) |
| Direction remote | Autonome+ (télécommande + features mobile exclusives) |
| Sécurité timeout | 24h d'inactivité + bouton déconnexion |
| Features mobile-only | Caméra → Chat en priorité |
| Prompt templates | Oui, configurables depuis le desktop |
| Notifications | Vibration + push OS (Service Worker) |
| Swipe gestures | Oui, horizontal entre les vues |
| Mission Control | Oui, écran dédié (4ème onglet) |
| File viewer | Oui, avec diff coloré |
| Usage/coûts | Pas pour l'instant |

### UI/UX
| Question | Réponse |
|----------|---------|
| Layout projet | Full-screen avec back button |
| Chat style | Hybride (bulles texte + blocs code) |
| Tool cards | Ultra compact, tap to expand |
| Dark/light | Dark only |
| Header projet | Minimal (nom + back) |
| Nav en projet | Bottom nav se transforme dynamiquement |
| Code highlighting | Basique custom (pas de lib) |
| Transitions | Slide horizontal |
| Input bar | Textarea + menu '+' (caméra, templates, model) |
| Permissions | Inline dans le chat |
| Liste projets | Section récents (scroll h) + liste complète |
| Mission Control | Liste avec status badges colorés |
| Back button | Flèche haut-gauche + swipe from edge |
| Chat scroll | FAB scroll-to-bottom |
