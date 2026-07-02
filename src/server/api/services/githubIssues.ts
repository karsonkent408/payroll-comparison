const OWNER = "karsonkent408";
const REPO = "payroll-comparison";

export async function createGitHubIssue(title: string, body: string, labels: string[] = ["bug"]): Promise<void> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return;

  await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/issues`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ title, body, labels }),
  });
}
