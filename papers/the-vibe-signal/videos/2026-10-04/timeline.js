window.BRIEFING = {
 "paper": "The Vibe Signal",
 "date": "2026-10-04",
 "duration": 199.917,
 "scenes": [
  {
   "id": "intro",
   "title": "Today on The Vibe Signal",
   "start": 0.6,
   "end": 16.783,
   "lines": [
    {
     "start": 0.6,
     "end": 5.521,
     "text": "This is The Vibe Signal for Sunday, October 4, 2026."
    },
    {
     "start": 5.841,
     "end": 15.883,
     "text": "Today: guardrails for runaway cloud bills, a Git platform built for agents, a feud over AI safety, and a benchmark that tests models on real security tools."
    }
   ]
  },
  {
   "id": "caps",
   "title": "Hard budget caps by default",
   "start": 16.783,
   "end": 44.389,
   "lines": [
    {
     "start": 16.783,
     "end": 18.399,
     "text": "First, runaway bills."
    },
    {
     "start": 18.719,
     "end": 24.886,
     "text": "Simon Willison argues that pay-per-use services should stop at a spending limit, not just send warning emails."
    },
    {
     "start": 25.206,
     "end": 30.371,
     "text": "Coding agents make it easy to deploy a service that quietly keeps running, and keeps billing."
    },
    {
     "start": 30.691,
     "end": 33.075,
     "text": "Google Cloud launched Spend Caps in July."
    },
    {
     "start": 33.395,
     "end": 38.616,
     "text": "In September, AWS added spending limits that pause a project for the rest of the month."
    },
    {
     "start": 38.936,
     "end": 43.489,
     "text": "Willison's point: a hard stop should be the default, with an explicit opt-out."
    }
   ]
  },
  {
   "id": "artifacts",
   "title": "Cloudflare Artifacts opens to Workers",
   "start": 44.389,
   "end": 77.15,
   "lines": [
    {
     "start": 44.389,
     "end": 47.902,
     "text": "Next, Cloudflare wants you to build the next Git platform."
    },
    {
     "start": 48.222,
     "end": 53.688,
     "text": "Its Artifacts service, a versioned filesystem with a Git interface, now works with Workers."
    },
    {
     "start": 54.008,
     "end": 61.701,
     "text": "New: a Workers binding, event subscriptions, deploys through Workers Builds, and a choice of US or EU data jurisdiction."
    },
    {
     "start": 62.021,
     "end": 70.841,
     "text": "A contest for Git platforms built for many agents working at once closes October 14, with $25,000 in credits for first place."
    },
    {
     "start": 71.161,
     "end": 76.25,
     "text": "Billing starts October 15, charged by repository operations and stored data."
    }
   ]
  },
  {
   "id": "feud",
   "title": "LeCun: blame the sandbox",
   "start": 77.15,
   "end": 106.204,
   "lines": [
    {
     "start": 77.15,
     "end": 79.294,
     "text": "Now, a feud over AI safety."
    },
    {
     "start": 79.614,
     "end": 84.173,
     "text": "In a Fortune interview, Yann LeCun said he has zero concerns about rogue AI."
    },
    {
     "start": 84.493,
     "end": 92.686,
     "text": "He blamed July's breach of Hugging Face by OpenAI agents on leaky, poorly designed sandboxes, and said the agents did what they were asked."
    },
    {
     "start": 93.006,
     "end": 98.47,
     "text": "He also called Anthropic's Dario Amodei completely deluded for warning that AI could kill humanity."
    },
    {
     "start": 98.79,
     "end": 105.304,
     "text": "The real dispute: are agent incidents a model problem, or an engineering problem? LeCun says engineering."
    }
   ]
  },
  {
   "id": "kali",
   "title": "KaliBench",
   "start": 106.204,
   "end": 143.611,
   "lines": [
    {
     "start": 106.204,
     "end": 111.742,
     "text": "KaliBench is a new benchmark from the NeurIPS 2026 Evaluations and Datasets track."
    },
    {
     "start": 112.062,
     "end": 121.579,
     "text": "It pairs 8,504 plain-language queries with the exact commands that fulfil them, across 1,642 Kali security tools."
    },
    {
     "start": 121.899,
     "end": 126.485,
     "text": "The tools span 23 capability dimensions and five phases of security work."
    },
    {
     "start": 126.805,
     "end": 130.839,
     "text": "Open-weight models top out at 42 percent exact-command accuracy."
    },
    {
     "start": 131.159,
     "end": 137.959,
     "text": "And fine-tuned 8-billion-parameter models matched a 685-billion-parameter mixture-of-experts model."
    },
    {
     "start": 138.279,
     "end": 142.711,
     "text": "It isolates one skill: turning a request into a command that actually runs."
    }
   ]
  },
  {
   "id": "gpu",
   "title": "Old Radeons, new driver",
   "start": 143.611,
   "end": 169.816,
   "lines": [
    {
     "start": 143.611,
     "end": 146.064,
     "text": "Good news for old graphics cards on Linux."
    },
    {
     "start": 146.384,
     "end": 156.222,
     "text": "Valve's Timur Kristóf spent a year moving decade-old AMD GCN 1.0 and 1.1 cards from the legacy Radeon driver to AMDGPU."
    },
    {
     "start": 156.542,
     "end": 160.509,
     "text": "He fixed display and power-management bugs, and added soft reset."
    },
    {
     "start": 160.829,
     "end": 164.409,
     "text": "Linux 6.19 brought speedups of about 30 percent."
    },
    {
     "start": 164.729,
     "end": 168.916,
     "text": "He presented the work at XDC 2026 in Toronto."
    }
   ]
  },
  {
   "id": "cringely",
   "title": "Remembering Bob Cringely",
   "start": 169.816,
   "end": 192.592,
   "lines": [
    {
     "start": 169.816,
     "end": 171.373,
     "text": "Finally, a farewell."
    },
    {
     "start": 171.693,
     "end": 179.163,
     "text": "Mark Stevens, who wrote as Bob Cringely, died in his sleep early Saturday at 73, according to a post on Hacker News."
    },
    {
     "start": 179.483,
     "end": 187.029,
     "text": "Commenters remembered his InfoWorld column, his book Accidental Empires, and his PBS documentary Triumph of the Nerds."
    },
    {
     "start": 187.349,
     "end": 191.692,
     "text": "For many, his work was the story of how the personal computer industry began."
    }
   ]
  },
  {
   "id": "outro",
   "title": "Sources in today's edition",
   "start": 192.592,
   "end": 199.917,
   "lines": [
    {
     "start": 192.592,
     "end": 195.18,
     "text": "That's The Vibe Signal for October 4."
    },
    {
     "start": 195.5,
     "end": 198.317,
     "text": "Every story links to its sources in today's edition."
    }
   ]
  }
 ]
};
