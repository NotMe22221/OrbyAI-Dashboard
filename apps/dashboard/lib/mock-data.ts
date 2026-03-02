import type { AgentBAction } from "@resident-secretary/contracts";

function mockEmails() {
  return [
    {
      id: "mock-msg-1",
      subject: "Q1 Product Review Agenda",
      from: "Lena Park <lena@orby.ai>",
      date: "Mon, 02 Mar 2026 08:42:00 -0600",
      snippet: "Please review the updated agenda before today’s 2 PM meeting.",
    },
    {
      id: "mock-msg-2",
      subject: "Design handoff ready",
      from: "Marcus Lee <marcus@orby.ai>",
      date: "Mon, 02 Mar 2026 07:55:00 -0600",
      snippet: "Final Figma screens are ready for implementation and QA notes are attached.",
    },
    {
      id: "mock-msg-3",
      subject: "Infra maintenance window",
      from: "Platform Ops <ops@orby.ai>",
      date: "Sun, 01 Mar 2026 18:11:00 -0600",
      snippet: "Staging maintenance is scheduled for tonight from 11 PM to 11:30 PM CT.",
    },
  ];
}

function mockCalendarItems() {
  const now = new Date();
  const d1 = new Date(now.getTime() + 60 * 60 * 1000).toISOString();
  const d2 = new Date(now.getTime() + 4 * 60 * 60 * 1000).toISOString();
  const d3 = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

  return [
    { id: "mock-cal-1", summary: "Daily Standup", start: { dateTime: d1 } },
    { id: "mock-cal-2", summary: "Product Review", start: { dateTime: d2 } },
    { id: "mock-cal-3", summary: "Roadmap Planning", start: { dateTime: d3 } },
  ];
}

function mockYouTubeItems() {
  return [
    {
      id: { videoId: "dQw4w9WgXcQ" },
      snippet: { title: "AI Agent Design Patterns (Demo)", description: "A walkthrough of practical agent architectures." },
    },
    {
      id: { videoId: "3fumBcKC6RE" },
      snippet: { title: "How to Build Voice Workflows", description: "Voice-first workflow examples for productivity apps." },
    },
    {
      id: { videoId: "L_jWHffIx5E" },
      snippet: { title: "Gemini + Tool Use Guide", description: "Combining intent models with tool calls." },
    },
  ];
}

function mockNotionResults() {
  return [
    {
      id: "mock-notion-1",
      url: "https://www.notion.so/mock/q1-planning",
      title: "Q1 Planning",
    },
    {
      id: "mock-notion-2",
      url: "https://www.notion.so/mock/weekly-sync-notes",
      title: "Weekly Sync Notes",
    },
  ];
}

export function getMockActionResult(action: AgentBAction) {
  switch (`${action.service}:${action.operation}`) {
    case "gmail:read_inbox":
      return {
        mock: true,
        source: "mock_data",
        total: 3,
        messages: mockEmails(),
      };

    case "calendar:list_events":
      return {
        mock: true,
        source: "mock_data",
        items: mockCalendarItems(),
      };

    case "youtube:search_and_summarize":
      return {
        mock: true,
        source: "mock_data",
        items: mockYouTubeItems(),
        open_url: "https://www.youtube.com",
      };

    case "notion:read_page":
      return {
        mock: true,
        source: "mock_data",
        results: mockNotionResults(),
      };

    default:
      return {
        mock: true,
        source: "mock_data",
        status: "prepared",
        note: `Demo mode: ${action.service}.${action.operation} prepared using mock data because this integration is not connected.`,
      };
  }
}
