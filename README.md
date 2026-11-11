# Boyfriend Tax

Turn their screen time into your flight time.

Every hour your partner spends in their game gets billed into your trip fund, and a tiny plane flies
closer to your destination with every dollar. It comes set up for GTA VI and a Japan trip, and you can change all of it.

**Use it:** [boyfriend-tax.vercel.app](https://boyfriend-tax.vercel.app) · **Demo:** [boyfriend-tax.vercel.app/?demo=1](https://boyfriend-tax.vercel.app/?demo=1) (nothing is saved in demo mode)

**Make your own copy in one click:**

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fbryanforhelp-star%2Fboyfriend-tax&project-name=boyfriend-tax&repository-name=boyfriend-tax)
[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/bryanforhelp-star/boyfriend-tax)

## What it does

Four tabs, plus a strip at the top that always shows hours played, what they owe, and how close the trip is.

- **Pick who's paying.** Choose boyfriend, girlfriend, partner, husband, wife or roommate, or type your own, and add
  their name if you like. The app calls them by name everywhere ("Alex started playing", "ALEX OWES") and never
  uses he or she.
- **Playtime.** Press "▶ Alex started playing" when the controller comes out and press it again when it goes down.
  A big clock counts the session and the money as it goes, and you get a receipt at the end. The timer keeps
  running if you close the tab. If you forgot to press it, use "Add hours I forgot". Hours × rate + penalties =
  what they owe. You can turn on overtime, for example 1.5× after 4 hours in one sitting.
- **Penalties:**
  - "One more mission" adds interest (15% by default) to whatever they owe.
  - "Missed a plan" adds a late fee.
  - "Mentally in Vice City" bills time they were in the room but not really there.
  - "Something else" lets you name your own penalty.
- **Trip fund.** What they owe is the trip fund. A plane flies from Home to your city, and each trip cost
  (flight, hotel, ramen) switches to PAID as the fund fills. At 100% you get a "Trip fully funded" pop-up.
- **Receipts.** Every session and penalty on one long receipt, with totals and an UNPAID stamp. Tap × to remove a
  line; Undo brings it back.
- **Send invoice, whenever you like.** Type their email once and "Email it" opens your email app with the whole
  invoice written out, line by line. There's a Gmail option too, plus Copy, and Text it on a phone. The app never
  sends anything itself; the email goes from your own account.
- **Names, rate & fund.** Change who's paying (boyfriend, girlfriend…), their name and email, the game, the rate,
  the fund's name and what it costs. There are Edit buttons right where those show up, too. The currency, penalty
  amounts and overtime are under More settings.
- **Backup & more.** Export a backup (`.json`), import one, try the demo, or start over.

## Use it

There's no install and no build step. The app is `index.html`, `style.css` and `app.js`, plus its icons and
`manifest.webmanifest` (so it can live on a Home Screen).

- **On your computer:** download this folder and open `index.html` in your browser.
- **Online, for free (pick one):**
  - **Vercel or Netlify:** press one of the Deploy buttons at the top. It copies this repo to your GitHub and
    puts it online. There's nothing to configure.
  - **GitHub Pages:** fork the repo, then go to Settings → Pages → Deploy from branch → `main`.
  - **Netlify Drop:** download the folder and drag it onto netlify.com/drop. No GitHub account needed.
- **On your phone:** open the link, then use Share → Add to Home Screen. It gets its own icon and opens full screen,
  like an app.

## Your data

Everything is stored in your browser's localStorage. Nothing is sent anywhere: there are no accounts, no
analytics and no server. That has two consequences:

- If you clear your browser data, your history goes with it. Use Export backup now and then.
- Data doesn't sync between devices. To move it to another device, export a backup there and import it.
- On iPhone, Safari can clear a website's data if you don't open it for about 7 days. Adding the app to your Home
  Screen avoids that.

## Change the code

- `app.js` holds the defaults (`DEFAULTS` at the top), all the math (`sessionCost`, `totals`) and every button
  (`ACTIONS`).
- `style.css` is the whole look (white, gel blue, 2000s Mac windows, receipts). Colors are variables at the top.
- Want a new penalty? Add a function to `ACTIONS` in `app.js`, then add a card for it to the list `P` in
  `render()`. Its button's `data-act` is the function's name, and clicks are wired up automatically.

Ideas people might build next: syncing between two phones, an auto-start when they come online using a console's
presence API, more currencies and languages.

## License

MIT. Do whatever you want with it.
