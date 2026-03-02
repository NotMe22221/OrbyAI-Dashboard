import type { IntegrationService } from "@resident-secretary/contracts";

export const ALL_SERVICES: IntegrationService[] = [
  "gmail",
  "calendar",
  "youtube",
  "notion",
];

export const QUICK_SAY_EXAMPLES: Record<IntegrationService, string[]> = {
  gmail: [
    "Read my three most recent emails.",
    "Draft a reply to Lena about the Q1 update.",
    "Archive emails I already replied to today.",
  ],
  calendar: [
    "What is on my calendar tomorrow?",
    "Schedule a 30-minute sync with Marcus next week.",
    "Move my 2 PM meeting to Thursday.",
  ],
  youtube: [
    "Summarize Andrej Karpathy's latest video.",
    "Find videos about AI agent evaluation.",
    "Pull key points from this YouTube URL.",
  ],
  slack: [
    "Post to #general that the demo is ready.",
    "Summarize unread mentions in engineering.",
    "Send Marcus a DM saying staging is ready.",
  ],
  linear: [
    "Create a high-priority bug for login issues.",
    "List my open sprint tickets.",
    "Mark LIN-847 as done.",
  ],
  notion: [
    "Summarize my Q1 planning page.",
    "Create meeting notes from this conversation.",
    "Add a decision section to the roadmap page.",
  ],
};

export const WRITE_OPERATIONS = ["send", "post", "create", "delete", "update", "modify"];



