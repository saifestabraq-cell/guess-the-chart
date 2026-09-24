# Guess.The.Chart

Guess the famous person from their birth chart. Players get four yes-or-no questions (answered by Claude) and four guesses.

## What's in here

| File | What it does |
|---|---|
| `index.html` | The whole game: chart maths, people list, design. |
| `api/ask.js` | Server function that answers one yes/no question with Claude. Your API key stays here, never in the browser. |
| `package.json` | Tells the host to install the Anthropic SDK for `api/ask.js`. |

## Deploy on Vercel (free tier is fine)

1. Get an API key at https://console.anthropic.com → **API Keys**. While you're there, set a monthly **spend limit** under Billing / Limits so a traffic spike can't surprise you.
2. Put this folder in a GitHub repository (github.com → New repository → upload these files, keeping `api/ask.js` inside an `api` folder).
3. Go to https://vercel.com, sign in with GitHub, click **Add New → Project**, and import the repository. Leave every build setting at its default.
4. Before clicking Deploy, open **Environment Variables** and add:
   - Name: `ANTHROPIC_API_KEY`
   - Value: your key
5. Click **Deploy**. You'll get an address like `guess-the-chart.vercel.app`.
6. Optional: **Settings → Domains** to attach your own domain.

If the key is missing or wrong, the site still works for guessing and shows "Questions need permission to use Claude."

## Costs and limits

- Each question is one small Claude request (model `claude-opus-5`, low effort). To make questions cheaper, change `model` in `api/ask.js` to `"claude-haiku-4-5"`, remove the `betas` and `fallbacks` lines, and redeploy.
- `api/ask.js` limits each visitor to about 20 questions a minute per server instance. For a busy site, add a shared rate limiter (for example Upstash Redis) and rely on the spend limit from step 1.
- The server builds the prompt itself and only ever returns `yes` / `no` / `unsure`, so the endpoint can't be misused as a free general chatbot.

## Changing the game

Edit `index.html` and push to GitHub; Vercel redeploys automatically. The small script block just above the main game script sends questions to `/api/ask`. The game code itself is identical to the Claude artifact version.
