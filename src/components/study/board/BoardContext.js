import { createContext, useContext } from 'react';

/** What a node on the board can ask the board to do, without every node taking props for it. */
export const BoardContext = createContext({ toggleSection: () => {}, resizeSection: () => {}, dropTarget: null });
export const useBoard = () => useContext(BoardContext);
