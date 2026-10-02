# pamosch

Team Capacity Timeline for a two-person project, served at https://www.pamosch.com/planning via GitHub Pages.

- `planning/index.html` – the whole app, served at /planning (no build step). Loads supabase-js from jsDelivr.
- `index.html` – start page with the pamosch logo (inline SVG, also in `logo.svg`).
- `src/` – sources of the timeline (`planning.template.html`, `schedule.js`); `python3 build.py` writes `planning/index.html`.
- `tests/schedule.test.js` – tests for the scheduling logic: `node tests/schedule.test.js`.
- `supabase/migrations/` – schema of the Supabase project `pamosch` (ref `bockhqjqeqwgjtlvgdfz`, Zürich).

## Data

One row `public.plans` with `id = 'main'` holds the plan as JSON. There is no login: anyone with the site can read and change the plan, but cannot insert or delete rows. Every change keeps the previous version in `public.plan_history` (at most one snapshot per 10 minutes, last 500 kept), which is not readable from the browser.

Restore an earlier version (Supabase SQL editor):

```sql
select id, saved_at from plan_history order by saved_at desc limit 20;
update plans set data = (select data from plan_history where id = <id>) where id = 'main';
```

The key in `index.html` is Supabase's publishable key, meant to be public.
