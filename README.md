# Kanban Board

A Kanban board with Google Calendar and Google Drive integration.

## Running the app

```bash
cd "/Users/chen@lmwn.com/To do list"
python3 -m http.server 5500
```

Then open **http://localhost:5500** in your browser.

---

## Google Integration Setup

Without credentials the app still works fully as a local Kanban board (tasks saved in localStorage). To enable Calendar events and Drive uploads, follow these steps.

### 1. Create a Google Cloud project

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project (or select an existing one)
3. Enable these two APIs:
   - **Google Calendar API**
   - **Google Drive API**

### 2. Create an API Key

1. Go to **APIs & Services → Credentials → Create Credentials → API key**
2. Restrict it to the Calendar API and Drive API (optional but recommended)
3. Copy the key

### 3. Create an OAuth 2.0 Client ID

1. Go to **APIs & Services → Credentials → Create Credentials → OAuth client ID**
2. Application type: **Web application**
3. Add to **Authorised JavaScript origins**:
   - `http://localhost:5500`
4. Copy the **Client ID**

### 4. Configure the app

Open [app.js](app.js) and replace the placeholders at the top:

```js
const GOOGLE_CLIENT_ID = 'YOUR_GOOGLE_CLIENT_ID';   // ← paste here
const GOOGLE_API_KEY   = 'YOUR_GOOGLE_API_KEY';     // ← paste here
```

Save the file and reload the browser.

---

## Features

| Feature | Works without Google sign-in |
|---|---|
| Create / edit / delete tasks | ✅ |
| Drag & drop between columns | ✅ |
| Priority, color, deadline, estimate | ✅ |
| Tasks persisted in localStorage | ✅ |
| Google Calendar event on task create | Requires sign-in |
| Calendar event updated on edit/move | Requires sign-in |
| File upload to Google Drive | Requires sign-in |
| File attachments linked on card | Requires sign-in |

## Keyboard shortcuts

- **⌘K / Ctrl+K** — New task
- **Escape** — Close modal
