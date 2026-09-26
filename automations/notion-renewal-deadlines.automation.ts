import { automation, each, onSchedule, t, transform } from "automate.ax"
import { linear } from "automate.ax/linear"
import { notion } from "automate.ax/notion"
import { slack } from "automate.ax/slack"
import { z } from "zod"

export default automation(
  "Review contract renewals before notice deadlines",
  {
    parameters: [
      { label: "Contracts data source ID", name: "dataSourceId", type: "text" },
      { label: "Linear team ID", name: "linearTeamId", type: "text" },
      {
        label: "Owner name to Linear user ID JSON",
        name: "assigneeMapJson",
        type: "text",
      },
      {
        label: "Renewals Slack channel ID",
        name: "slackChannelId",
        type: "text",
      },
      { label: "Reminder time zone", name: "timeZone", type: "text" },
      { label: "Review lead days", name: "reviewLeadDays", type: "text" },
    ],
  },
  ({ parameters }) => {
    const assigneeIds = z
      .record(z.string(), z.string())
      .parse(JSON.parse(parameters.assigneeMapJson))
    const reviewLeadDays = z.coerce
      .number()
      .int()
      .nonnegative()
      .parse(parameters.reviewLeadDays)
    const tick = onSchedule({
      schedule: "0 9 * * *",
      timeZone: parameters.timeZone,
    })
    const contracts = notion.queryDataSource({
      data_source_id: parameters.dataSourceId,
      page_size: 100,
    })

    const due = transform([contracts, tick], (result, { scheduledAt }) => {
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: parameters.timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).formatToParts(scheduledAt)
      const part = (type: string) =>
        parts.find((value) => value.type === type)?.value ?? ""
      const today = `${part("year")}-${part("month")}-${part("day")}`

      return result.results.flatMap((entry) => {
        const contract = z
          .object({
            id: z.string(),
            url: z.url(),
            properties: z.object({
              Name: z.object({
                title: z.array(z.object({ plain_text: z.string() })),
              }),
              Status: z.object({ status: z.object({ name: z.string() }) }),
              "Renewal Date": z.object({
                date: z.object({ start: z.iso.date() }).nullable(),
              }),
              "Notice Days": z.object({
                number: z.number().int().nonnegative(),
              }),
              "Owner Name": z.object({
                rich_text: z.array(z.object({ plain_text: z.string() })),
              }),
              "Linear Issue URL": z.object({ url: z.url().nullable() }),
            }),
          })
          .parse(entry)
        const renewalDate = contract.properties["Renewal Date"].date?.start
        const owner = contract.properties["Owner Name"].rich_text
          .map(({ plain_text }) => plain_text)
          .join("")
        if (
          contract.properties.Status.status.name !== "Active" ||
          !renewalDate ||
          contract.properties["Linear Issue URL"].url ||
          !assigneeIds[owner]
        ) {
          return []
        }

        const noticeDays = contract.properties["Notice Days"].number
        const noticeDate = new Date(
          Date.parse(`${renewalDate}T00:00:00Z`) - noticeDays * 86_400_000,
        )
          .toISOString()
          .slice(0, 10)
        const reviewDate = new Date(
          Date.parse(`${noticeDate}T00:00:00Z`) - reviewLeadDays * 86_400_000,
        )
          .toISOString()
          .slice(0, 10)
        if (reviewDate > today || renewalDate < today) return []

        return [
          {
            id: contract.id,
            url: contract.url,
            name: contract.properties.Name.title
              .map(({ plain_text }) => plain_text)
              .join(""),
            renewalDate,
            noticeDate,
            noticeDays,
            assigneeId: assigneeIds[owner],
          },
        ]
      })
    })

    each(due, (contract) => {
      const issue = linear.createIssue({
        teamId: parameters.linearTeamId,
        assigneeId: contract.assigneeId,
        title: t`Review renewal: ${contract.name}`,
        dueDate: contract.noticeDate,
        description: t`Renewal date: ${contract.renewalDate}\nNotice period: ${contract.noticeDays} days\nContract: ${contract.url}\n\nReview the actual contract terms before deciding whether to renew or cancel.`,
      })

      notion.updatePage({
        page_id: contract.id,
        properties: { "Linear Issue URL": { url: issue.url } },
      })

      slack.sendMessage({
        conversation: parameters.slackChannelId,
        text: t`Renewal review due: ${contract.name} (${contract.renewalDate}). Owner issue: ${issue.url}`.transform(
          escapeSlackText,
        ),
        unfurlLinks: false,
      })
    })
  },
)

/** Keeps provider text from becoming Slack mentions or control markup. */
function escapeSlackText(text: string) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
}
