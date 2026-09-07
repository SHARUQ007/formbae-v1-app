import React from 'react';
import { Alert, StyleSheet } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { AppDialogProvider } from './AppDialogProvider';

describe('AppDialogProvider', () => {
  let renderer: ReactTestRenderer.ReactTestRenderer | null = null;

  afterEach(() => {
    if (!renderer) return;
    ReactTestRenderer.act(() => renderer?.unmount());
    renderer = null;
  });

  async function renderProvider() {
    await ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <AppDialogProvider>
          <></>
        </AppDialogProvider>,
      );
    });
    return renderer!;
  }

  it('keeps destructive confirmations content-sized with two clear actions', async () => {
    const tree = await renderProvider();
    ReactTestRenderer.act(() => {
      Alert.alert('Leave this match?', 'Shared proof photos will be deleted.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Leave match', style: 'destructive' },
      ]);
    });

    const card = tree.root.findByProps({ testID: 'app-dialog-card' });
    const cardStyle = StyleSheet.flatten(card.props.style);
    expect(cardStyle.height).toBeUndefined();
    expect(cardStyle.flex).toBeUndefined();
    expect(cardStyle.maxHeight).toBeGreaterThan(280);
    expect(tree.root.findByProps({ accessibilityLabel: 'Cancel' })).toBeTruthy();
    expect(tree.root.findByProps({ accessibilityLabel: 'Leave match' })).toBeTruthy();
  });

  it('preserves action-sheet choices without making the card full screen', async () => {
    const tree = await renderProvider();
    ReactTestRenderer.act(() => {
      Alert.alert('Submit today’s proof', 'Your photo stays private.', [
        { text: 'Take photo' },
        { text: 'Choose from library' },
        { text: 'Cancel', style: 'cancel' },
      ]);
    });

    expect(tree.root.findByProps({ accessibilityLabel: 'Take photo' })).toBeTruthy();
    expect(tree.root.findByProps({ accessibilityLabel: 'Choose from library' })).toBeTruthy();
    expect(tree.root.findByProps({ accessibilityLabel: 'Cancel' })).toBeTruthy();
    expect(tree.root.findByProps({ testID: 'app-dialog-card' })).toBeTruthy();
  });
});
