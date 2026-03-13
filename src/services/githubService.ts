const GITHUB_TOKEN = "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";
const RAW_OWNER = "jawad438";
const RAW_REPO = "https://github.com/jawad438/ScanStock";
const FOLDER = "SupermarketJSON";

// Sanitize OWNER and REPO in case full URLs are provided
const OWNER = RAW_OWNER?.split('/').pop()?.trim();
const REPO = RAW_REPO?.replace(/\/$/, '').split('/').pop()?.trim();

if (!GITHUB_TOKEN || !OWNER || !REPO) {
  console.warn("GitHub configuration is missing or invalid. Please check your environment variables.");
}

export interface SupermarketData {
  email: string;
  token: string;
  products: {
    barcode: string;
    name: string;
    price: number;
  }[];
}

async function githubFetch(path: string, options: RequestInit = {}) {
  if (!GITHUB_TOKEN || !OWNER || !REPO) {
    throw new Error("GitHub configuration is missing. Please set VITE_GITHUB_TOKEN, VITE_GITHUB_OWNER, and VITE_GITHUB_REPO in your secrets.");
  }

  const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `token ${GITHUB_TOKEN}`,
      Accept: "application/vnd.github.v3+json",
      ...options.headers,
    },
  });
  
  if (response.status === 401) {
    throw new Error("GitHub authentication failed. Your token might be invalid or expired.");
  }

  if (response.status === 404 && options.method !== 'GET' && options.method !== undefined) {
    // If we are trying to PUT/POST and get a 404, it might mean the REPO or OWNER is wrong
    // because the contents API returns 404 if the file doesn't exist (which is fine for GET),
    // but if the REPO doesn't exist, it also returns 404.
    // Let's verify if the repo exists
    const repoCheck = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}`, {
      headers: { Authorization: `token ${GITHUB_TOKEN}` }
    });
    if (repoCheck.status === 404) {
      throw new Error(`Repository "${OWNER}/${REPO}" not found. Please check your OWNER and REPO settings.`);
    }
  }
  
  return response;
}

export async function isTokenUsed(token: string): Promise<boolean> {
  try {
    const lockFileName = `token_${token}.lock`;
    const response = await githubFetch(`${FOLDER}/${lockFileName}`);
    return response.status === 200;
  } catch (error) {
    console.error("Error checking token:", error);
    if (error instanceof Error && error.message.includes("authentication failed")) {
      throw error;
    }
    return false;
  }
}

export async function getSupermarketData(email: string): Promise<SupermarketData | null> {
  try {
    const fileName = `${email.replace(/[@.]/g, "_")}.json`;
    const response = await githubFetch(`${FOLDER}/${fileName}`);
    if (response.status === 404) return null;
    const json = await response.json();
    const content = decodeURIComponent(escape(atob(json.content)));
    return JSON.parse(content);
  } catch (error) {
    console.error("Error fetching supermarket data:", error);
    return null;
  }
}

export async function saveSupermarketData(data: SupermarketData) {
  const fileName = `${data.email.replace(/[@.]/g, "_")}.json`;
  const path = `${FOLDER}/${fileName}`;
  
  // Get current file to get sha
  const getResponse = await githubFetch(path);
  let sha: string | undefined;
  if (getResponse.status === 200) {
    const json = await getResponse.json();
    sha = json.sha;
  }

  const content = btoa(unescape(encodeURIComponent(JSON.stringify(data, null, 2))));
  const response = await githubFetch(path, {
    method: "PUT",
    body: JSON.stringify({
      message: `Update data for ${data.email}`,
      content,
      sha,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to save data to GitHub");
  }
}

export async function createSupermarketFile(email: string, token: string) {
  const data: SupermarketData = {
    email,
    token,
    products: [],
  };
  
  // Create the lock file for the token
  const lockFileName = `token_${token}.lock`;
  const lockPath = `${FOLDER}/${lockFileName}`;
  const lockContent = btoa(JSON.stringify({ email, usedAt: new Date().toISOString() }));
  
  const response = await githubFetch(lockPath, {
    method: "PUT",
    body: JSON.stringify({
      message: `Lock token ${token}`,
      content: lockContent,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to create lock file on GitHub");
  }

  await saveSupermarketData(data);
}
