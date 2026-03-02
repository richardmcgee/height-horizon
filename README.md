# Height Horizon

**Predict when heights will align** — a growth prediction tool that estimates when (and if) a younger sibling will catch up in height to an older sibling or parent.

![Height Horizon screenshot](screenshot.png)

## Features

- **Add family members** — parents, older siblings, younger siblings, or anyone else
- **Multiple measurements** — enter two or more height measurements over time for each growing child
- **CDC growth chart projection** — calculates each child's growth percentile and projects their trajectory to age 18 using CDC 2000 stature-for-age LMS data
- **Catch-up timeline** — predicts the age at which a younger child will match or surpass an older sibling's or parent's height
- **Mid-parental height targets** — estimates genetic height potential from parent heights (±8.5 cm range)
- **Interactive growth chart** — visualises measured data, projected curves, parent heights, and mid-parental targets on a single Chart.js scatter plot
- **Light and dark mode** — automatic system preference detection with manual toggle
- **Responsive** — works on desktop and mobile
- **No server required** — runs entirely in the browser, no data is sent anywhere

## How It Works

### Growth Percentile Tracking

Each child's height measurements are converted to Z-scores using the CDC 2000 LMS (Lambda-Mu-Sigma) parameters. The LMS method uses a Box-Cox transformation to normalise the distribution of height at each age:

```
Z = ((height / M)^L − 1) / (L × S)
```

Where **L**, **M**, and **S** are age- and sex-specific parameters from the CDC reference data.

### Height Projection

The average Z-score from the child's most recent measurements defines their "growth channel." This Z-score is projected forward using the LMS data to estimate height at any future age:

```
Height = M × (1 + L × S × Z)^(1/L)
```

### Mid-Parental Height

When both parents are entered, mid-parental target heights are calculated:

- **Boys:** (mother's height + father's height + 13 cm) ÷ 2
- **Girls:** (mother's height + father's height − 13 cm) ÷ 2

The 68% confidence interval is ±8.5 cm around the target.

### Catch-Up Prediction

The tool projects both children's heights month-by-month and finds the age at which the younger child's projected height meets or exceeds the older person's height. If no crossover occurs by age 18, it reports that catch-up is unlikely.

## Data Sources

- **CDC 2000 Growth Charts** — stature-for-age LMS parameters for ages 2–20 years ([CDC Growth Chart Data Files](https://www.cdc.gov/growthcharts/cdc-data-files.htm))
- **CDC/WHO Infant Length Charts** — length-for-age LMS parameters for birth to 36 months ([Restored CDC WHO Data Files](https://restoredcdc.org/www.cdc.gov/growthcharts/who-data-files.htm))
- **Mid-parental height method** — [AAP eQIPP Clinical Guide](https://eqipp.aap.org/courses/growth2/mn/clinical-guide/popups/mid-parental-height)

All 510 LMS data points (both sexes, birth through age 20) are embedded directly in `cdc_data.js`.

## Tech Stack

- Vanilla HTML, CSS, and JavaScript — no build tools or frameworks
- [Chart.js 4.4](https://www.chartjs.org/) for the interactive growth chart
- [Google Fonts](https://fonts.google.com/) — Instrument Serif + DM Sans
- Fully static — can be hosted on GitHub Pages, Netlify, S3, or opened directly as a local file

## Project Structure

```
height-horizon/
├── index.html      ← Main page
├── base.css        ← CSS reset and base styles
├── style.css       ← Design tokens and component styles
├── app.js          ← Application logic and prediction engine
├── cdc_data.js     ← CDC 2000 LMS data (510 data points)
├── screenshot.png  ← Screenshot for README
└── README.md
```

## Usage

**Option 1 — Open locally:**
Download the repo and open `index.html` in any modern browser.

**Option 2 — GitHub Pages:**
Enable GitHub Pages in your repo settings (source: root, branch: main) and it will be live at `https://<username>.github.io/height-horizon/`.

## Limitations

- Projections assume a child will continue growing along their current percentile. Growth can shift due to puberty timing, nutrition, illness, or other factors.
- The CDC 2000 reference data is based on a US population sample from 1963–1994. It may not perfectly represent all populations.
- This tool is for educational and informational purposes only. It is not a substitute for clinical assessment by a paediatrician or endocrinologist.
- Bone age assessment (X-ray) provides more accurate predictions than statistical methods alone.

## Licence

MIT — see [LICENCE](LICENCE) file.
