import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { NicknameEditor } from '@/components/nickname-editor';
import { NicknamesProvider } from '@/context/nicknames-context';
import { createMemoryStorage, type KeyValueStorage, NICKNAMES_STORAGE_KEY } from '@/lib/nicknames';

const ID = 'AA:BB';

function renderEditor(storage: KeyValueStorage) {
  return render(
    <NicknamesProvider storage={storage}>
      <NicknameEditor deviceId={ID} />
    </NicknamesProvider>,
  );
}

async function savedIn(storage: KeyValueStorage) {
  return JSON.parse((await storage.getItem(NICKNAMES_STORAGE_KEY)) ?? '{}');
}

test('shows the saved name once it has loaded, and only an actual change can be saved', async () => {
  await renderEditor(createMemoryStorage({ [NICKNAMES_STORAGE_KEY]: JSON.stringify({ [ID]: 'Phone' }) }));
  expect(await screen.findByDisplayValue('Phone')).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();

  // Trailing spaces are trimmed when saving, so this is no change.
  await fireEvent.changeText(screen.getByLabelText('Nickname'), 'Phone ');
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();

  await fireEvent.changeText(screen.getByLabelText('Nickname'), 'Phone 2');
  expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
});

test('saves a cleaned-up name on this phone', async () => {
  const storage = createMemoryStorage();
  await renderEditor(storage);

  await fireEvent.changeText(screen.getByLabelText('Nickname'), '  My speaker ');
  await fireEvent.press(screen.getByRole('button', { name: 'Save' }));

  await waitFor(async () => expect(await savedIn(storage)).toEqual({ [ID]: 'My speaker' }));
  expect(await screen.findByDisplayValue('My speaker')).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
});

test('Clear removes the name, and is disabled when there is nothing to clear', async () => {
  const storage = createMemoryStorage({ [NICKNAMES_STORAGE_KEY]: JSON.stringify({ [ID]: 'Bike lock' }) });
  await renderEditor(storage);
  await screen.findByDisplayValue('Bike lock');

  await fireEvent.press(screen.getByRole('button', { name: 'Clear' }));

  await waitFor(async () => expect(await savedIn(storage)).toEqual({}));
  expect(await screen.findByDisplayValue('')).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Clear' })).toBeDisabled();
});
