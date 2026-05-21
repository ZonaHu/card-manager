import React from 'react';
import type { Card, CardCategory, Transaction, UserRegion } from '../../types';
import { CATEGORIES } from '../../constants/categories';

import { TransactionEditModal } from '../forms/TransactionEditModal';
import { CardForm } from '../forms/CardForm';
import { TransactionForm } from '../forms/TransactionForm';
import { AddCardOptions } from '../forms/AddCardOptions';
import { CardDetailModal } from '../cards/CardDetailModal';
import About from '../About';
import PlaidLink from '../PlaidLink';
import PlaidUpdateLink from '../PlaidUpdateLink';
import RegionSelector from '../RegionSelector';

interface DashboardModalsProps {
  // Shared data
  token: string;
  cards: Card[];
  transactions: Transaction[];
  userRegion: UserRegion;
  cardCategories: Record<string, CardCategory>;
  isNewUser: boolean;

  // Plaid Link
  showPlaidLink: boolean;
  onPlaidLinkSuccess: () => void;
  onClosePlaidLink: () => void;

  // Plaid reauth (update mode)
  reauthTarget: { itemId: string; institutionName: string } | null;
  onReauthSuccess: () => void;
  onReauthExit: () => void;

  // Region selector
  showRegionSelector: boolean;
  onRegionSelected: (country: string) => void;
  onCloseRegionSelector: () => void;

  // Manual Add Card
  showAddCard: boolean;
  onAddCard: (data: any) => void;
  onCloseAddCard: () => void;

  // Manual Add Transaction
  showAddTransaction: boolean;
  onAddTransaction: (data: any) => void;
  onCloseAddTransaction: () => void;

  // Add-card branch picker (Plaid vs manual)
  showAddCardOptions: boolean;
  onPickPlaid: () => void;
  onPickManual: () => void;
  onCloseAddCardOptions: () => void;

  // Edit-transaction modal
  showTransactionEditModal: boolean;
  editingTransaction: Transaction | null;
  onUpdateTransaction: (data: any) => void;
  onCancelEditTransaction: () => void;
  onReimbursementChange: () => void;
  onDeleteTransaction: (id: number, description: string) => void;

  // Card detail
  showCardDetail: boolean;
  selectedCard: Card | null;
  onCloseCardDetail: () => void;
  onTransactionClick: (transaction: Transaction) => void;

  // About
  showAbout: boolean;
  onCloseAbout: () => void;
}

/**
 * All modal mounts that the dashboard can pop. Centralizes the conditional
 * rendering so the parent doesn't carry 9 separate JSX blocks — each modal
 * still has its own state in the parent (open flag + any selected target),
 * but the wiring lives here. Each modal manages its own backdrop + Escape
 * dismissal internally.
 */
export const DashboardModals: React.FC<DashboardModalsProps> = (props) => {
  return (
    <>
      {props.showPlaidLink && (
        <PlaidLink
          token={props.token}
          onSuccess={props.onPlaidLinkSuccess}
          onClose={props.onClosePlaidLink}
          isNewUser={props.isNewUser}
        />
      )}

      {props.reauthTarget && (
        <PlaidUpdateLink
          itemId={props.reauthTarget.itemId}
          institutionName={props.reauthTarget.institutionName}
          onSuccess={props.onReauthSuccess}
          onExit={props.onReauthExit}
        />
      )}

      {props.showRegionSelector && (
        <RegionSelector
          token={props.token}
          onRegionSelected={props.onRegionSelected}
          onClose={props.onCloseRegionSelector}
          currentRegion={props.userRegion.country}
        />
      )}

      {props.showAddCard && (
        <CardForm
          onSubmit={props.onAddCard}
          onCancel={props.onCloseAddCard}
          cardCategories={props.cardCategories}
        />
      )}

      {props.showAddTransaction && (
        <TransactionForm
          cards={props.cards}
          categories={CATEGORIES}
          onSubmit={props.onAddTransaction}
          onCancel={props.onCloseAddTransaction}
        />
      )}

      {props.showAddCardOptions && (
        <AddCardOptions
          onConnectBank={props.onPickPlaid}
          onAddManually={props.onPickManual}
          onClose={props.onCloseAddCardOptions}
        />
      )}

      {props.showTransactionEditModal && props.editingTransaction && (
        <TransactionEditModal
          transaction={props.editingTransaction}
          cards={props.cards}
          allTransactions={props.transactions}
          onSubmit={props.onUpdateTransaction}
          onCancel={props.onCancelEditTransaction}
          onReimbursementChange={props.onReimbursementChange}
          onDelete={props.onDeleteTransaction}
        />
      )}

      {props.showCardDetail && props.selectedCard && (
        <CardDetailModal
          card={props.selectedCard}
          transactions={props.transactions}
          userRegion={props.userRegion}
          onClose={props.onCloseCardDetail}
          onTransactionClick={props.onTransactionClick}
        />
      )}

      {props.showAbout && (
        <About onClose={props.onCloseAbout} />
      )}
    </>
  );
};
