import { FileText, Layers, Scissors } from "lucide-react";
import { motion } from "motion/react";

interface Props {
  onSelectMode: (mode: "overview" | "pdfSplit" | "pdfMerge") => void;
}

const modes = [
  {
    key: "overview" as const,
    icon: FileText,
    title: "Bild zu PDF",
    description:
      "Fotos aufnehmen, zuschneiden, filtern und als PDF exportieren.",
    color: "from-primary/20 to-primary/5",
    iconBg: "bg-primary/15",
    iconColor: "text-primary",
  },
  {
    key: "pdfSplit" as const,
    icon: Scissors,
    title: "PDF aufteilen",
    description:
      "Seiten aus einer PDF auswählen und als neues Dokument speichern.",
    color: "from-accent/30 to-accent/5",
    iconBg: "bg-accent",
    iconColor: "text-accent-foreground",
  },
  {
    key: "pdfMerge" as const,
    icon: Layers,
    title: "PDF zusammenfügen",
    description:
      "Mehrere PDFs in beliebiger Reihenfolge zu einem Dokument vereinen.",
    color: "from-secondary to-secondary/30",
    iconBg: "bg-secondary",
    iconColor: "text-secondary-foreground",
  },
];

export function HomeScreen({ onSelectMode }: Props) {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="pt-safe-top">
        <div className="max-w-lg mx-auto px-5 pt-12 pb-8 text-center">
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary shadow-card mb-5">
              <FileText className="w-8 h-8 text-primary-foreground" />
            </div>
            <h1 className="text-3xl font-bold font-display tracking-tight text-foreground mb-2">
              PDF Werkzeuge
            </h1>
            <p className="text-muted-foreground text-base">
              Alles rund ums PDF – direkt auf deinem Gerät.
            </p>
          </motion.div>
        </div>
      </header>

      <main className="flex-1 max-w-lg mx-auto w-full px-5 pb-8">
        <div className="flex flex-col gap-4">
          {modes.map((mode, i) => {
            const Icon = mode.icon;
            return (
              <motion.button
                key={mode.key}
                type="button"
                data-ocid={`home.${mode.key}.button`}
                onClick={() => onSelectMode(mode.key)}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: 0.1 + i * 0.08 }}
                whileTap={{ scale: 0.97 }}
                className="w-full text-left bg-card border border-border rounded-2xl p-5 flex items-start gap-4 shadow-card active:bg-accent/30 transition-colors"
              >
                <div
                  className={`flex-shrink-0 w-14 h-14 rounded-xl ${mode.iconBg} flex items-center justify-center`}
                >
                  <Icon className={`w-7 h-7 ${mode.iconColor}`} />
                </div>
                <div className="flex-1 min-w-0 pt-0.5">
                  <h2 className="text-lg font-bold font-display text-foreground leading-tight mb-1">
                    {mode.title}
                  </h2>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {mode.description}
                  </p>
                </div>
                <div className="flex-shrink-0 self-center">
                  <svg
                    aria-hidden="true"
                    width="20"
                    height="20"
                    viewBox="0 0 20 20"
                    fill="none"
                    className="text-muted-foreground/50"
                  >
                    <path
                      d="M7 4l6 6-6 6"
                      stroke="currentColor"
                      strokeWidth="1.75"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
              </motion.button>
            );
          })}
        </div>
      </main>

      <footer className="text-center text-xs text-muted-foreground py-4 border-t border-border">
        © {new Date().getFullYear()}. Erstellt mit{" "}
        <a
          href={`https://caffeine.ai?utm_source=caffeine-footer&utm_medium=referral&utm_content=${encodeURIComponent(window.location.hostname)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-foreground"
        >
          caffeine.ai
        </a>
      </footer>
    </div>
  );
}
