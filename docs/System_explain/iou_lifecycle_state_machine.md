# IOUNFT Life Cycle State Machine

The following state machine diagram illustrates the life cycle of an IOUNFT (IOU Non-Fungible Token) as defined in the `IOUNFT.sol` smart contract.
## Main Diagram
```mermaid
stateDiagram-v2
    %% Main States
    [*] --> Pending : mintIOU
    
    %% Pending State Transitions
    Pending --> Pending : modifyPending<br>(by creator)
    Pending --> Active : acceptIOU<br>(by fulfiller)
    Pending --> Cancelled : refundPending<br>(by creator)
    
    %% Active State with simple nodes
    state Active {
        FulfillmentFlow : Fulfillment Flow
        TransferFlow : Transfer Flow (Social IOU Only)
    }

    %% Settlement Flow (Triggered from Fulfillment Flow)
    FulfillmentFlow --> Settled : requestClose & confirmClose<br>(contract executes settleIOU)
    
    %% Timeout Flow
    Active --> Cancelled : timeoutClaim<br>(by creator after deadline)

    Settled --> [*]
    Cancelled --> [*]
```
## Full Diagram

```mermaid
stateDiagram-v2
    %% Main States
    [*] --> Pending : mintIOU
    
    %% Pending State Transitions
    Pending --> Active : acceptIOU<br>(by fulfiller)
    Pending --> Pending : modifyPending<br>(by creator)
    
    %% Sub-states for Active
    state Active {
        %% Close Request Flow
        state "Fulfillment Flow" as FulfillmentFlow {
            [*] --> Working
            Working --> CloseRequested : requestClose<br>(by fulfiller)
            CloseRequested --> Working : rejectClose<br>(by owner)
        }
        
        --
        
        %% Transfer Flow (For Social IOUs)
        state "Transfer Flow (Social IOU Only)" as TransferFlow {
            [*] --> Idle
            Idle --> TransferInitiated : startTransfer<br>(by owner)
            TransferInitiated --> Idle : rejectTransfer<br>(by owner/fulfiller/newOwner)
            
            state "Transfer Approvals" as Approvals {
                TransferInitiated --> AwaitingApprovals
                AwaitingApprovals --> NewOwnerConfirmed : confirmTransferByNewOwner
                AwaitingApprovals --> FulfillerConfirmed : confirmTransferByFulfiller
                NewOwnerConfirmed --> Executed : confirmTransferByFulfiller
                FulfillerConfirmed --> Executed : confirmTransferByNewOwner
            }
            Executed --> Idle : Internal execution transfers<br>ownership and resets state
        }
    }

    %% Settlement Flow
    CloseRequested --> Settled : confirmClose (by owner)<br>contract executes settleIOU

    %% Cancellations placed at the end to improve routing and reduce overlap
    Pending --> Cancelled : refundPending<br>(by creator)
    Active --> Cancelled : timeoutClaim<br>(by creator after deadline)

    Settled --> [*]
    Cancelled --> [*]
```

## State Descriptions

*   **Pending**: The initial state when an IOU is minted. The creator has defined the terms, and the IOU is waiting for a fulfiller to accept it.
    *   *Transitions*: Can be modified (`modifyPending`), cancelled/refunded (`refundPending`), or moved to Active if accepted (`acceptIOU`).
*   **Active**: The IOU is actively being worked on by the fulfiller.
    *   *Sub-flows*:
        *   **Fulfillment Flow**: The fulfiller can request closure (`requestClose`) if they believe the work is done. The owner can reject this request (`rejectClose`).
        *   **Transfer Flow**: For Social IOUs (0 collateral), the owner can initiate a transfer of ownership (`startTransfer`). This requires confirmation from both the new owner and the fulfiller.
    *   *Transitions*: Can be settled by the creator/owner (`settleSocialIOU`, `settleBountyIOU`, or `confirmClose`), or cancelled if the deadline passes (`timeoutClaim`).
*   **Settled**: The final success state. The IOU has been resolved, reputation has been awarded, and any collateral has been paid out or marketplace fees collected. No further actions can be taken.
*   **Cancelled**: The final failure/abort state. The IOU was either cancelled before acceptance or expired without successful settlement. Any collateral is refunded to the creator. No further actions can be taken.
