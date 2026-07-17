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

// The six hub-neurons. Ordered roughly by recency / prominence.
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
    link: "projects/eeg.html",
    accent: "#fbbf24", // yang / fire — gold lightning (neural firing)
    motif: "storm",  // yang — jagged bolts, intermittent strikes
  },
  {
    id: "aces",
    title: "A.C.E.S — Agentic Control System",
    short: "Agents",
    kicker: "LLM Agents • Real-time Systems",
    period: "2026",
    blurb:
      "Upgraded a one-shot multi-agent prototype into a 24/7 control system. Specialized " +
      "LLM agents coordinated via LangChain + LangGraph, a unified entity data model, and " +
      "volatility-based safety limits — all surfaced through a live dashboard.",
    tags: ["LangGraph", "LangChain", "LLM", "Python"],
    link: "projects/aces.html",
    accent: "#34d399", // yin / water — terminal emerald (24/7 markets)
    motif: "cycle",  // yin — ring wave circling inward (24/7 loop)
  },
  {
    id: "vision",
    title: "Recognition & Segmentation",
    short: "Vision",
    kicker: "Computer Vision • Deep Learning",
    period: "Jan – May 2025",
    blurb:
      "CNNs for large-scale scene recognition (~70% top-1) and ResNet-backed semantic " +
      "segmentation for pixel-level labeling. Built and trained end-to-end in PyTorch.",
    tags: ["PyTorch", "ResNet", "CNN", "Segmentation"],
    link: "projects/vision.html",
    accent: "#fb923c", // yang / fire — flash orange (camera)
    motif: "burst",  // yang — synchronized radial flash (camera)
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
    link: "projects/biomarker.html",
    accent: "#a78bfa", // yin / water — neuro violet (inner states)
    motif: "wave",   // yin — slow glow along waveform traces
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
    link: "projects/maze.html",
    accent: "#f87171", // yang / fire — signal red (road signs)
    motif: "path",   // yang — pulses racing right-angle corridors
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
    link: "projects/dtx.html",
    accent: "#7dd3fc", // yin / water — therapeutic sky (calm)
    motif: "halo",   // yin — concentric breathing rings
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
