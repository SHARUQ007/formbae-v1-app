import React from 'react';
import { Image } from 'react-native';
import { act, create } from 'react-test-renderer';
import { ReadingArticleCard, readingImageAt } from './ReadingArticleCard';

it('omits repeated publisher covers and removes failed images instead of recycling artwork', async () => {
  const article = { id: 'one', title: 'New research', url: 'https://news.harvard.edu/one', imageUrl: 'https://news.harvard.edu/cover.jpg?w=728' };
  const articles = [article, { ...article, id: 'two', imageUrl: 'https://news.harvard.edu/cover.jpg?w=300' }];
  expect(readingImageAt(articles, 0)).toBe(article.imageUrl);
  expect(readingImageAt(articles, 1)).toBeUndefined();
  let tree!: ReturnType<typeof create>;
  await act(() => { tree = create(<ReadingArticleCard article={article} imageUrl={article.imageUrl} onPress={() => {}} />); });
  expect(tree.root.findByType(Image).props.source).toEqual({ uri: article.imageUrl });
  await act(() => tree.root.findByType(Image).props.onError());
  expect(tree.root.findAllByType(Image)).toHaveLength(0);
  await act(() => tree.unmount());
});
