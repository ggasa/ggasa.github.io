// Project + experience data for Dan Kim's portfolio.
// Each "hub" is a neuron in the network. When the cloud is in NETWORK mode the hubs
// are spread out; when in PORTRAIT mode all points collapse into Dan's face.
// `link` opens the project's own page. Swap the placeholder URLs for real ones.

export const PROFILE = {
  name: "Dan Kim",
  role: "AI / ML • Neural & Biosignal Data",
  tagline: "Turning noisy signals into structure — EEG, physiology, time-series.",
  location: "Atlanta, GA",
  email: "rlanewzeal@gmail.com",
  links: {
    linkedin: "https://www.linkedin.com/in/dongyeunkim/",
    github: "https://github.com/ggasa/",
    website: "https://dankims.vercel.app",
    resume: "assets/Dan_Kim_Resume.pdf",
  },
  summary:
    "Graduate researcher at Georgia Tech (MS Robotics — AI). I build data pipelines and " +
    "interpretable models for non-stationary, biological signals: EEG motor imagery, " +
    "heart-rate–brain coupling, and high-throughput classification. Mechanical engineering " +
    "roots, a UX research chapter, and a bias toward things that are both rigorous and legible.",
};

// The five hub-neurons. Ordered roughly by recency / prominence.
// `mode` is the neuron's signature glyph (0 storm, 1 cycle, 3 wave, 4 path,
// 5 halo — see buildBranches() in scene.js; 2/burst was Vision's and is
// retired with it, not reassigned) and `pol` is its yin-yang polarity
// (+1 fire/yang, -1 water/yin). Both are explicit fields — NOT derived from
// array position — so a project can be added or removed without reshuffling
// every other project's animation and color identity.
export const PROJECTS = [
  {
    id: "eeg",
    title: "EEG Motor Imagery Decoding",
    short: "EEG",
    kicker: "Neuroscience • Deep Learning",
    period: "May – Jul 2025",
    blurb:
      "CNN + Temporal Convolutional Network to classify 4-class motor imagery from the " +
      "BCI Competition IV-2a dataset. ~70% accuracy on raw, non-stationary EEG by tuning " +
      "neural decoders to the signal, not the other way around.",
    tags: ["PyTorch", "TCN", "EEG", "Time-series"],
    link: "projects/eeg/",
    accent: "#fbbf24", // yang / fire — gold lightning (neural firing)
    motif: "storm",  // yang — jagged bolts, intermittent strikes
    mode: 0, pol: 1,
  },
  {
    id: "aces",
    title: "A.C.E.S — Agentic Control System",
    short: "Agents",
    kicker: "LLM Agents • Real-time Systems",
    period: "2026",
    blurb:
      "A phased experiment testing whether multi-agent LLM systems can trade well enough " +
      "to trust. Specialized agents read indicators, chart patterns, and trend structure " +
      "in parallel via LangChain + LangGraph, with four architectures and two model " +
      "choices tested head-to-head before any of it touches real capital.",
    tags: ["LangGraph", "LangChain", "LLM", "Python"],
    link: "projects/aces/",
    accent: "#34d399", // yin / water — terminal emerald (24/7 markets)
    motif: "cycle",  // yin — ring wave circling inward (24/7 loop)
    mode: 1, pol: -1,
  },
  {
    id: "biomarker",
    title: "Physiological Biomarker ML",
    short: "Biomarkers",
    kicker: "Research • Interpretable ML",
    period: "Nov 2024 – 2026",
    blurb:
      "Python ETL turning raw JSON logs into analysis-ready datasets, then interpretable " +
      "models (regression, trees) on non-stationary physiology — ~0.70 AUC, with candidate " +
      "biomarkers surfaced via game-theoretic (SHAP-style) interpretability.",
    tags: ["scikit-learn", "ETL", "SHAP", "Statistics"],
    link: "projects/biomarker/",
    accent: "#a78bfa", // yin / water — neuro violet (inner states)
    motif: "wave",   // yin — slow glow along waveform traces
    mode: 3, pol: -1,
  },
  {
    id: "maze",
    title: "Autonomous Maze Robot",
    short: "Robotics",
    kicker: "Robotics • ROS2",
    period: "Aug – Dec 2024",
    blurb:
      "Vision pipeline (preprocessing + SVM) reading road signs for autonomous navigation, " +
      "tuned inside the ROS2 Nav2 stack to trim sensor-to-actuator latency.",
    tags: ["ROS2", "Nav2", "SVM", "OpenCV"],
    link: "projects/maze/",
    accent: "#f87171", // yang / fire — signal red (road signs)
    motif: "path",   // yang — pulses racing right-angle corridors
    mode: 4, pol: 1,
  },
  {
    id: "dtx",
    title: "Digital Therapeutics UX",
    short: "HCI / UX",
    kicker: "HCI Research • Behavioral",
    period: "Apr 2022 – Jun 2023",
    blurb:
      "Persuasive onboarding for digital therapeutics that lifted user attitude +15%. Mixed " +
      "qualitative/quantitative research, standardized validation frameworks, and findings " +
      "presented at Korea's HCI conference.",
    tags: ["UX Research", "DTx", "Mixed-methods"],
    link: "projects/dtx/",
    accent: "#7dd3fc", // yin / water — therapeutic sky (calm)
    motif: "halo",   // yin — concentric breathing rings
    mode: 5, pol: -1,
  },
];

// A short experience timeline, rendered as an EEG-style trace.
export const TIMELINE = [
  { year: "2024–26", org: "Georgia Tech", role: "Graduate Research Student (AI / Neural Data)" },
  { year: "2025–26", org: "Georgia Tech", role: "Graduate Teaching Assistant" },
  { year: "2023–24", org: "KITECH (gov)", role: "Robotics Automation Research Intern" },
  { year: "2022–23", org: "Companoid Labs", role: "Product Insight Analyst (UX)" },
  { year: "2017–19", org: "ROK Army", role: "Information Operations — 'Best Decryption'" },
];
