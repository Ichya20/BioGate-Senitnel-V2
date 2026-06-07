export type VoiceVerifyResponse = {
  status: "MATCH" | "ACCESS_DENIED" | "FAILED";
  user?: string;
  score: number;
  threshold?: number;
  match: boolean;
  reason?: string;
};

const VOICE_API_BASE = "http://127.0.0.1:8000";

export async function verifyVoiceFromBlob(
  blob: Blob,
  expectedUser: string
): Promise<VoiceVerifyResponse> {
  const formData = new FormData();
  formData.append("expected_user", expectedUser);
  formData.append("file", blob, "voice.webm");

  const response = await fetch(`${VOICE_API_BASE}/api/voice/verify`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Voice API error: ${response.status}`);
  }

  return response.json();
}