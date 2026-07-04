import { useCallback, useState } from 'react';

const emptyChannelForm = { name: '', description: '', category: 'Community', isPrivate: false };

export default function useChannelModalState({
  activeChannel,
  addPeopleToChannel,
  canManage,
  createChannel,
  renameChannel,
  setError,
}) {
  const [channelModalOpen, setChannelModalOpen] = useState(false);
  const [channelForm, setChannelForm] = useState(emptyChannelForm);
  const [pickedMembers, setPickedMembers] = useState([]);
  const [creatingChannel, setCreatingChannel] = useState(false);
  const [renamingChannelId, setRenamingChannelId] = useState(null);
  const [newName, setNewName] = useState('');
  const [addPeopleOpen, setAddPeopleOpen] = useState(false);
  const [addPicked, setAddPicked] = useState([]);

  const openChannelModal = useCallback(() => {
    setChannelForm({ ...emptyChannelForm, isPrivate: !canManage });
    setPickedMembers([]);
    setChannelModalOpen(true);
    setError('');
  }, [canManage, setError]);

  const createFromModal = useCallback(async (event) => {
    event.preventDefault();
    setCreatingChannel(true);
    const created = await createChannel({ channelForm, pickedMembers });
    if (created) {
      setChannelForm(emptyChannelForm);
      setPickedMembers([]);
      setChannelModalOpen(false);
    }
    setCreatingChannel(false);
  }, [channelForm, createChannel, pickedMembers]);

  const startRename = useCallback(() => {
    if (!activeChannel) return;
    setRenamingChannelId(activeChannel.id);
    setNewName(activeChannel.name);
    setError('');
  }, [activeChannel, setError]);

  const renameFromModal = useCallback(async (event) => {
    event.preventDefault();
    const renamed = await renameChannel(renamingChannelId, newName);
    if (renamed) {
      setRenamingChannelId(null);
      setNewName('');
    }
  }, [newName, renameChannel, renamingChannelId]);

  const openAddPeople = useCallback(() => {
    setAddPicked([]);
    setAddPeopleOpen(true);
  }, []);

  const addPeopleFromModal = useCallback(async () => {
    const added = await addPeopleToChannel(activeChannel, addPicked);
    if (added || !addPicked.length) {
      setAddPicked([]);
      setAddPeopleOpen(false);
    }
  }, [activeChannel, addPeopleToChannel, addPicked]);

  return {
    addPeopleFromModal,
    addPeopleOpen,
    addPicked,
    channelForm,
    channelModalOpen,
    createFromModal,
    creatingChannel,
    newName,
    openAddPeople,
    openChannelModal,
    pickedMembers,
    renameFromModal,
    renamingChannelId,
    setAddPeopleOpen,
    setAddPicked,
    setChannelForm,
    setChannelModalOpen,
    setNewName,
    setPickedMembers,
    setRenamingChannelId,
    startRename,
  };
}
