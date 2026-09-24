# Fluxer D&D Dice Bot

A small dice roller for Fluxer, built with TypeScript and `@fluxerjs/core`. It runs as a persistent Node.js process on Railway. No database or incoming HTTP endpoint is needed. Guided rolls use short-lived in-memory sessions.

```text
!r d20+7 attack
!r 2d6+4 damage
!r 4d6kh3 ability score
!adv +8 perception
!dis +3 stealth
!help
```

Example response:

> 🎲 Attack Roll
>
> 2d20kh1 + 8
>
> Rolls: [17, ~~5~~] + 8
>
> Total: **25**

## Commands

| Command | Behavior |
| --- | --- |
| `!roll` or `!r` alone | Start a guided roll with reactions and replies |
| `!r d20` or `!roll d20` | Roll one die; omitted count defaults to 1 |
| `!r 8d6 fireball damage` | Roll multiple dice with an optional label |
| `!r d20+7` / `!r d20-2` | Apply one signed integer modifier |
| `!r 4d6kh3` | Keep the highest three dice |
| `!r 2d20kl1+5` | Keep the lowest die, then add five |
| `!adv +7 perception` | `2d20kh1+7`; modifier and label are optional |
| `!dis -1 stealth` | `2d20kl1-1`; modifier and label are optional |
| `!help` | Show concise usage and limits |

Command names and dice notation are case-insensitive. `!r 2D6 + 4` and `!r 2d6+4` are equivalent. Commands must start at the beginning of the message and have whitespace before their arguments. Bot messages and unsupported commands are ignored.

The expression grammar is `[count]d<sides>[khN|klN][+N|-N]`. Spaces are allowed around the modifier operator, but not inside dice or keep tokens. A label starts after whitespace following the completed expression. Labels preserve the user's capitalization, including acronyms and character names; their markdown, mentions, line breaks and control characters are safely formatted.

V1 accepts one dice group and one modifier. `2d6+1d8`, `d20+2+3`, decimals, multiplication, rerolls and exploding dice are not supported. A label cannot begin with a formula continuation such as `+2`, `kh1`, or `2d6`; this avoids silently treating an unfinished formula as a successful roll. For `!adv` and `!dis`, use a sign on modifiers (`+7`, not `7`). Labels never change the calculation.

### Results and limits

- Dice stay in their original roll order. Dropped dice use strikethrough; tied values are retained in original order until the keep count is reached.
- A natural 1 or 20 is called out only when exactly one retained die is a d20. Modifiers and dropped dice cannot change that callout. The bot applies no automatic success, failure or critical-damage rules.
- Rolls of up to 20 dice show every result. Larger rolls explicitly show the first 20, the kept/dropped counts, the complete subtotal and final total.
- Limits: **1–100 dice**, **2–10,000 sides**, **1–count kept dice**, **±100,000 modifier**, **200 characters per command**, **100 characters per label**. Length limits count JavaScript UTF-16 units, so some emoji count as two.
- Random rolls use Node's `crypto.randomInt(1, sides + 1)`. This provides uniform random integers, not an independently verifiable roll record.

## Guided rolls and community welcomes

Send `!roll` or `!r` without arguments to build a roll interactively. The bot asks for die size, count, normal/advantage/disadvantage/keep rules, keep count when needed, and a modifier. Confirm with 🎲 or reply `roll` to generate the result. It shows the equivalent `!r` command afterward. Guided rolls do not ask for a label; use a complete command when you want one.

- React to a labeled choice, or use **Reply** on the bot's prompt and type an answer. Ordinary conversation is ignored. Text replies work even if reaction permission is missing.
- Only the user who started a session can answer it. One session per user per channel; other users can build independent rolls.
- The bot updates one prompt message. `back` and `cancel` work as replies; corresponding reactions are available too. If a reaction you already selected remains, toggle it off and on to select it again.
- Advantage/disadvantage are offered for d20s and automatically use two dice, keeping one. Keep-highest/lowest ask for a valid retained count.
- Nothing is rolled until confirmation. Fast repeated inputs during a prompt update are ignored; wait for the next question before answering.
- Sessions expire after **two minutes of inactivity**, have a global cap of **100**, and disappear on restart. Starting another guided roll in the same channel replaces your previous one. Deleting the prompt also discards its session.
- Complete commands like `!r d20+7` still roll immediately, including when used as a reply to the prompt.

When invited to a new community while running, the bot posts a brief welcome in its system text channel if it has permission, otherwise the first accessible text channel in channel order. If none is writable, it stays silent. It never mentions users, sends DMs, or announces existing communities during startup/reconnect. An existing community will not receive a retrospective welcome when you deploy this update; use `!help` to see the instructions.

For clickable choices, grant the bot **Add Reactions**, alongside **View Channel**, **Send Messages**, and **Read Message History**. These permissions combine to `68672` in an OAuth bot-invite URL. For a bot already installed, update its role/channel permissions in community settings. **Manage Messages** and **Administrator** are not needed: the bot only removes its own reactions, never other users' messages or reactions.

## Local setup

Use **Node.js 24 LTS** (the SDK minimum is 22.13) and **pnpm 10.32.1**, pinned in `package.json`.

```sh
git clone https://github.com/andrewsjohnson/fluxer-dice-bot.git
cd fluxer-dice-bot
npm install --global pnpm@10.32.1
pnpm install --frozen-lockfile
cp .env.example .env
```

Create a Fluxer bot application and token using Fluxer's developer settings, then set `FLUXER_BOT_TOKEN` in your local `.env`. Invite/authorize the bot in your Fluxer community with permission to view the intended channel, send messages, read message history, and add reactions. Do not grant administrator permissions just to roll dice. The SDK does not require gateway intents.

```sh
pnpm dev
```

Wait for `[info] ready`, then send `!help` in a channel accessible to the bot. Use `Ctrl+C` to stop it.

For compiled production execution:

```sh
pnpm build
pnpm start
```

Both scripts load `.env` if it exists; externally supplied environment variables take precedence. Production containers use injected variables directly.

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `FLUXER_BOT_TOKEN` | Yes | None | Fluxer bot token |
| `LOG_LEVEL` | No | `info` | `debug`, `info`, `warn`, `error`, or `silent` |
| `NODE_ENV` | No | Runtime default | Conventionally `development` locally and `production` in Railway |

Never commit a real token. `.env*` files are excluded from Git and the container build context; `.env.example` contains placeholders only. If a token is exposed, regenerate it in Fluxer and update Railway's variable. Do not paste tokens into issues or logs.

## Deploy on Railway

1. Create a Railway project/service from this GitHub repository and select `main`.
2. Add `FLUXER_BOT_TOKEN` in the service's **Variables** before deployment. Set `LOG_LEVEL=info`; the Docker image already sets `NODE_ENV=production`.
3. Use the repository's **Dockerfile**. It installs locked dependencies, typechecks, runs tests, compiles TypeScript, and produces a non-root runtime image containing only production dependencies and compiled code. Leave custom build/start overrides empty; the container runs `node dist/index.js` directly so shutdown signals reach Node.
4. Configure a persistent service with **one replica**, **serverless/sleep disabled**, no cron schedule, no HTTP healthcheck, and no public domain. Do not attach a database or volume.
5. Set **Restart Policy: On Failure**, with the maximum retries available for your plan (10 is a reasonable initial value). After retries are exhausted, fix the failure and redeploy. Run only one active service per bot token to avoid duplicate replies; stop any local development copy when testing production.
6. Deploy and check for `starting`, `connected`, and `ready`. Then run `!help`, `!r d20+7 attack`, `!r 4d6kh3`, and `!adv +5` in Fluxer.

Railway deployment settings are applied in the dashboard. This repository intentionally uses a Dockerfile plus the settings above, rather than the deprecated `railway.json`/`railway.toml` mechanism. If you later manage infrastructure in code, use Railway's current `.railway/railway.ts` workflow.

### Deployment acceptance checks

These require your Railway account and a real Fluxer bot token; the unit suite does not claim to verify a live deployment.

- Confirm each supported command returns exactly one reply in the intended channel.
- Restart the Railway service; confirm it reaches `ready` and responds again.
- During a controlled network interruption, confirm the SDK reconnects/resumes and subsequent rolls work. Routine disconnects are handled by the SDK; terminal authentication/configuration closures stop the process so Railway can restart it.
- Check that startup without a token fails with a clear configuration error. If a deployment repeatedly fails, confirm its token, channel access, restart policy and outbound gateway connectivity.
- A running container alone does not prove the bot is connected: use the `ready` log and an actual command as the smoke test.

For an optional local container check:

```sh
docker build -t fluxer-dice-bot .
docker run --rm --env-file .env fluxer-dice-bot
```

## Development and testing

```sh
pnpm typecheck     # Strict TypeScript checking for source and tests
pnpm test          # Deterministic test suite; exits on completion
pnpm test:watch    # Watch mode
pnpm build        # Compile to dist/
pnpm check        # Typecheck, tests, then production build
```

GitHub Actions runs checks on Node 22.13 and 24 and builds the production Docker image. Dependabot proposes dependency and Actions updates weekly. `pnpm-workspace.yaml` explicitly permits esbuild's installation script, needed by the development tools.

Tests cover numeric bounds, case/whitespace, malformed expressions, deterministic ties, original roll order, modifiers, natural-roll rules, labels, markdown/mention safety, long input/output, bot filtering, single-reply behavior, send failures, configuration, and gateway event wiring. The evaluator accepts `evaluate(expression, { rollDie: () => 6 })` for deterministic tests. SDK client wiring tests run without connecting to Fluxer.

### Code layout

| Path | Responsibility |
| --- | --- |
| `src/index.ts` | Startup validation, login, signals, bounded shutdown and fatal errors |
| `src/config.ts`, `src/logger.ts` | Environment validation and minimal operational logs |
| `src/fluxer/client.ts` | Fluxer SDK configuration and event handlers |
| `src/fluxer/command-router.ts` | Command recognition and one safe reply per command |
| `src/commands/` | Roll, advantage, disadvantage and help handlers |
| `src/dice/parser.ts` | Explicit grammar and validated intermediate representation |
| `src/dice/evaluator.ts` | Secure rolls, deterministic keep behavior, totals and naturals |
| `src/dice/formatter.ts` | All user-facing roll, error and help formatting |
| `src/dice/types.ts`, `limits.ts`, `errors.ts` | Shared engine types, bounds and categorized errors |
| `src/guided/` | Guided roll state transitions and bounded in-memory sessions |
| `src/fluxer/welcome.ts` | New-community welcome channel selection |
| `tests/` | Engine, command, guided flow, welcome and runtime tests |

Parsing never rolls dice. Evaluation never formats a reply. The engine has no Fluxer dependency. New syntax should extend the intermediate representation and tests before changing command behavior.

## Operations and privacy

The bot has no database, analytics, files of rolls, saved user profiles, channel history or campaign state. Guided sessions temporarily retain the initiating user/channel IDs, bot prompt, and roll selections until completion, cancellation, expiry, deletion, or restart. Incoming answers are not retained as conversation history. SDK message caching is disabled. Routing metadata and active gateway session state exist only in process memory; the bot's replies remain in Fluxer.

Logs use fixed event names such as `command_failed command=roll` and never include message text, labels, user/channel IDs, tokens, or raw SDK exceptions. `debug` currently exposes the same safe operational events as `info`; it does not enable raw gateway logging. A failed reply is logged without attempting another reply. No automatic per-user cooldown is included in V1.

The SDK manages rate limits and routine gateway reconnection. Startup has a 60-second deadline. `SIGINT`/`SIGTERM` close the gateway; fatal errors exit nonzero after cleanup, with a five-second shutdown deadline. Rolls are ephemeral: a restart can interrupt an in-flight response, and the bot does not replay commands or recover roll history.

No user input is evaluated as JavaScript or passed to a shell. Multi-expression rolls, saved aliases, character sheets, initiative, private rolls, persistence and a web interface are explicitly deferred.

## References

- [Fluxer.js SDK and getting started](https://fluxer.js.org/)
- [Fluxer.js allowed mentions](https://fluxer.js.org/guides/v/3.1.0/allowed-mentions/)
- [Railway Dockerfiles](https://docs.railway.com/builds/dockerfiles)
- [Railway restart policy](https://docs.railway.com/deployments/restart-policy)
- [Railway infrastructure as code](https://docs.railway.com/infrastructure-as-code)
