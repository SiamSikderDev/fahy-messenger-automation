# Facebook Messenger Webhook Bun.js Server

This is a lightweight Facebook Messenger webhook server built using [Bun.js](https://bun.sh/) and its native `Bun.serve` API.

## Prerequisites

- **Bun.js** installed on your system (e.g. at `C:\Users\HP\.bun\bin\bun.exe`).

## Installation & Setup

1. Open your terminal in this directory (`/fahy`).
2. Verify you have a `.env` file with your preferred port and verify token (defaults are already configured):
   ```env
   PORT=3000
   VERIFY_TOKEN=my_secret_token_123
   ```

## Running the Server

Start the webhook server:
```bash
bun start
```

Or using the full path if `bun` is not in your global `PATH`:
```bash
C:\Users\HP\.bun\bin\bun.exe run index.js
```

The server will log:
```
Starting Facebook Messenger Webhook Server...
Server is listening on port 3000
Verification Token is set to: "my_secret_token_123"
```

## Testing & Verification

### 1. Test Verification (GET Request)

Facebook will send a verification challenge to your GET `/webhook` endpoint. Run the following PowerShell command in a separate terminal window to simulate this verification:

```powershell
Invoke-RestMethod -Uri "http://localhost:3000/webhook?hub.verify_token=my_secret_token_123&hub.challenge=hello_facebook&hub.mode=subscribe"
```

**Expected Response:** `hello_facebook`

### 2. Test Message Reception (POST Request)

To simulate a user sending a message to your Page, run this PowerShell command to send a mock event payload to the POST `/webhook` endpoint:

```powershell
$body = @{
  object = "page"
  entry = @(
    @{
      id = "123456789"
      time = 1458692752478
      messaging = @(
        @{
          sender = @{ id = "USER_PSID_98765" }
          recipient = @{ id = "PAGE_ID_12345" }
          timestamp = 1458692752478
          message = @{
            mid = "mid.1458692752478:3b46325c75"
            text = "Hello there from Bun.js!"
          }
        }
      )
    }
  )
} | ConvertTo-Json -Depth 5

Invoke-RestMethod -Method Post -Uri "http://localhost:3000/webhook" -Body $body -ContentType "application/json"
```

**Expected API Response:** `EVENT_RECEIVED`

**Expected Server Logs (in server console):**
```
--- [Webhook Event Received] ---
{
  "object": "page",
  "entry": [
    ...
  ]
}
Message Details:
- Sender PSID: USER_PSID_98765
- Recipient Page ID: PAGE_ID_12345
- Text: "Hello there from Bun.js!"
--------------------------------
```

## Hosting on Render

To deploy this webhook server publicly on Render:

1. **Push your code to a Git repository** (GitHub or GitLab).
2. **Log into [Render](https://render.com/)** and create a new **Web Service**.
3. **Connect your repository**.
4. Render will automatically detect the `Dockerfile` and select **Docker** as the environment runtime.
5. In the **Environment Variables** section, configure the following values:
   - `VERIFY_TOKEN`: Set this to a secure random string (e.g., `your_custom_verify_token`).
   - `PORT`: Set this to `3000` (Render will automatically route public HTTPS traffic to this port).
6. Click **Deploy Web Service**.
7. Once deployed, Render will provide a public URL (e.g., `https://fahy-messenger-webhook.onrender.com`).

Use `https://fahy-messenger-webhook.onrender.com/webhook` as your Facebook Webhook URL, and your custom `VERIFY_TOKEN` as the verification token.
