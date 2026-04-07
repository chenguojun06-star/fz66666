import { useState, useCallback, useEffect } from 'react';
import { intelligenceApi as execApi } from '@/services/intelligenceApi';

export function useAgentMeeting() {
  const [meetingTopic, setMeetingTopic] = useState('');
  const [holdingMeeting, setHoldingMeeting] = useState(false);
  const [meetingResult, setMeetingResult] = useState<any>(null);
  const [meetingHistory, setMeetingHistory] = useState<any[]>([]);

  const holdMeeting = useCallback(async () => {
    if (!meetingTopic.trim()) return;
    setHoldingMeeting(true);
    setMeetingResult(null);
    try {
      const res = await execApi.holdAgentMeeting(meetingTopic.trim()) as any;
      const d = res?.data ?? res;
      setMeetingResult(d);
      setMeetingTopic('');
      // refresh history
      const hRes = await execApi.listAgentMeetings(5) as any;
      setMeetingHistory((hRes?.data ?? hRes) || []);
    } catch { setMeetingResult({ error: true }); }
    finally { setHoldingMeeting(false); }
  }, [meetingTopic]);

  useEffect(() => {
    (execApi.listAgentMeetings(5) as any).then((r: any) => setMeetingHistory((r?.data ?? r) || [])).catch(() => {});
  }, []);

  return { meetingTopic, setMeetingTopic, holdingMeeting, meetingResult, meetingHistory, holdMeeting };
}
