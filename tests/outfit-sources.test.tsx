import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import knowledge from '../scripts/outfit_knowledge.json';
import type { OutfitEvaluation } from '../lib/types';
import { isOutfitEvaluation } from '../lib/outfit-evaluation';
import { EvaluationSummary } from '../components/ai-outfits';

function grounded(): OutfitEvaluation {
  const criterion = knowledge.criteria[0];
  return { protocol:'outfit-v3-sources',knowledgeVersion:knowledge.version,groundingStatus:'linked',
    decision:'recommend',visual:'ordinary',context:'suitable',contextReason:'일상 외출 기준이에요.',
    limitations:['실제 핏은 확인하지 못했어요.'],
    observations:[{id:'e1',itemId:'a',aspect:'pattern',fact:'상의에 그래픽이 있다.'},
      {id:'e2',itemId:'b',aspect:'pattern',fact:'하의는 무지다.'}],
    reasons:[{aspect:'overall',observation:'상의의 그래픽이 중심이 돼요.',
      criterionId:criterion.id,principle:criterion.principle,effect:'support',
      itemIds:['a','b'],evidenceIds:['e1','e2'],
      sources:criterion.sourceIds.map(id=>knowledge.sources.find(s=>s.id===id)!)}] };
}
test('source-linked results reject fabricated URLs, unknown evidence and a foreign knowledge version',()=>{
  assert.equal(isOutfitEvaluation(grounded()),true);
  const badUrl=grounded();badUrl.reasons[0].sources=badUrl.reasons[0].sources!.map(s=>({...s,url:'https://fake.invalid'}));
  assert.equal(isOutfitEvaluation(badUrl),false);
  const missing=grounded();missing.reasons[0].evidenceIds=['e1','missing'];
  assert.equal(isOutfitEvaluation(missing),false);
  const version=grounded();version.knowledgeVersion='future';
  assert.equal(isOutfitEvaluation(version),false);
  const uncertain=grounded();uncertain.reasons[0].effect='uncertain';
  assert.equal(isOutfitEvaluation(uncertain),false);
});
test('source UI distinguishes photo observations, the principle and AI interpretation',()=>{
  const html=renderToStaticMarkup(<EvaluationSummary value={grounded()} />);
  assert.match(html,/판단에 사용한 자료/);
  assert.match(html,/fitnyc.edu/);
  assert.match(html,/AI의 해석/);
  assert.match(html,/관찰/);
});
