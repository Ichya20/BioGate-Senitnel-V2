export type FaceVerifyResponse = {
  status: "MATCH" | "ACCESS_DENIED" | "FAILED";
  reason: string;
  duress_alarm: boolean;
  score: number;
  confidence: number;
  user: null | {
    user_id: string;
    name: string;
  };
};

const FACE_API_BASE = "http://127.0.0.1:8000";

export async function verifyFaceFromBlob(blob: Blob): Promise<FaceVerifyResponse> {
  const formData = new FormData();
  formData.append("file", blob, "scan.jpg");

  const response = await fetch(`${FACE_API_BASE}/api/face/verify`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Face API error: ${response.status}`);
  }

  return response.json();
}