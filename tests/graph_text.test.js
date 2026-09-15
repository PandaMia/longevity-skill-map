const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { parse, plainText } = require('../static/graph-text.js');
const graph = JSON.parse(readFileSync(require('node:path').join(__dirname, '../graph/longevity-skills.json'), 'utf8'));

test('linear algebra exposes five topics followed by the original explanation', () => {
  const summary = graph.nodes.find(node => node.id === 'linear_algebra').summary;
  assert.deepEqual(parse(summary), [
    { type: 'list', items: ['Vectors', 'Matrices', 'Linear transformations', 'Eigenvalues', 'Matrix decompositions.'] },
    { type: 'paragraph', text: 'A shared prerequisite for multi-omics, ML, network models, and image analysis.' }
  ]);
});

test('commas, conjunctions and decimal values in prose do not create lists', () => {
  const text = 'Compare controls, treatments, and measurement errors. Use p = 0.05 and -1.5 as examples.';
  assert.deepEqual(parse(text), [{type: 'paragraph', text}]);
});

test('explicit bullets support introductions, wrapped items and concluding paragraphs', () => {
  assert.deepEqual(parse('Topics:\n\n- First\n  continued\n• Second\n\nKeep the explanation intact.'), [
    {type: 'paragraph', text: 'Topics:'},
    {type: 'list', items: ['First continued', 'Second']},
    {type: 'paragraph', text: 'Keep the explanation intact.'}
  ]);
});

test('search previews flatten lists without exposing formatting markers', () => {
  assert.equal(plainText('Topics:\n\n- Vectors\n- Matrices.\n\nShared knowledge.'), 'Topics: Vectors, Matrices. Shared knowledge.');
});

test('compound concepts stay together in the formatted dataset', () => {
  const chemistry = parse(graph.nodes.find(node => node.id === 'school_chemistry').summary)[0].items;
  assert(chemistry.includes('Acids and bases'));
  assert(chemistry.includes('Thermodynamics and kinetics.'));
  const safety = parse(graph.nodes.find(node => node.id === 'cancer_proofing_surveillance').summary)[0].items;
  assert(safety.includes('Safety constraints for regenerative and reprogramming therapies.'));
});
