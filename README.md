# Catch vendor contract renewals before the notice window closes

Put renewal decisions in a shared work queue before the last day to act passes.

Contracts do not share one reminder schedule. One may need 30 days of notice, another 60, and an auto-renewal can be easy to overlook when the reminder sits in one person’s inbox.

This workflow scans a Notion contracts database, calculates each notice deadline from its renewal date and notice period, and creates an owned review item a chosen number of days before that deadline. A shared Slack handoff points the team to the review task. Contracts without a mapped Linear owner are skipped, so check that mapping before relying on the scan.

## Set it up with a coding agent

Copy the setup prompt from [the article](https://automate.ax/articles/notion-renewal-deadlines) into your coding agent. The agent creates the Automate.ax project, asks for your choices, guides account authorization, checks the automation, and deploys it. You do not need to clone this repository yourself when using the prompt.

You'll choose:

- The Notion contract records and fields for renewal date, notice days, owner, and review status.
- The Linear team and Slack channel for shared review.
- A mapping from each Notion Owner Name to its Linear user ID.
- How many days before the notice deadline to create the review task.
- The time zone and a test contract with a known notice deadline.
- Account authorization for Notion, Linear, and Slack.

## Manual setup

If you prefer to set it up yourself:

```sh
git clone https://github.com/SentsCo/automate-ax-notion-renewal-deadlines.git
cd automate-ax-notion-renewal-deadlines
bun install
bunx automate.ax login
bunx automate.ax init
bun run typecheck
bunx automate.ax deploy
```

Connect the accounts requested by Automate.ax when you deploy. The platform stores credentials outside this repository. Set any project parameters requested by the automation, then review the read and write operations before turning it on.

## Check a run

Create a disposable contract whose notice date falls within the chosen lead time, run the automation, and inspect the assigned Linear issue, Slack message, and Notion issue URL. Run it again to confirm the second pass does not create another issue. Delete the test records afterward.

## Limits

- A reminder cannot interpret contract terms or make a renewal decision. An owner must verify the deadline against the signed agreement.
- A contract added after its review date can create an overdue issue. Check the actual notice deadline before taking action.
- If a renewal date or notice period changes, the team needs an explicit rule for resetting the review marker.
- The automation checks the first 100 Notion contract records. Add pagination before using it with a larger database.
- Restrict account access and messages so sensitive contract details stay with authorized reviewers.

The workflow responds to [a real problem described by a contract manager’s renewal discussion](https://www.reddit.com/r/ContractManagement/comments/1w35mam/how_do_you_track_contract_renewals_without/). The public report informed the example; it is not an endorsement of this implementation.
